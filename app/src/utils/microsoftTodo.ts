import { doc, updateDoc, writeBatch, collection } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User } from '../types';

const CLIENT_ID = '5b6039c6-5e18-48d8-b122-7c155709d3d7';
const REDIRECT_URI = 'https://tradingmanagement-c1cf4.web.app/auth-callback';
export const SCOPES = 'Tasks.ReadWrite User.Read openid profile offline_access';

// ── PKCE 암호화 유틸리티 ──────────────────────────────────────────────────
const dec2hex = (dec: number) => ('0' + dec.toString(16)).substring(-2);

const generateCodeVerifier = () => {
  const array = new Uint32Array(56);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join('');
};

const sha256 = async (plain: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
};

const base64urlencode = (a: ArrayBuffer) => {
  let str = "";
  const bytes = new Uint8Array(a);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const generateCodeChallenge = async (verifier: string) => {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
};

/**
 * Microsoft Login URL 생성 (Authorization Code Flow + PKCE)
 */
export const getMicrosoftLoginUrl = async (): Promise<string> => {
  const state = Math.random().toString(36).substring(2, 15);
  localStorage.setItem('ms_auth_state', state);

  // PKCE 보안 키 쌍 생성
  const verifier = generateCodeVerifier();
  localStorage.setItem('ms_code_verifier', verifier);

  const challenge = await generateCodeChallenge(verifier);

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&state=${state}&response_mode=query&code_challenge=${challenge}&code_challenge_method=S256`;
};

/**
 * Microsoft Access Token 실시간 자동 갱신 (Refresh Token 활용)
 */
export const refreshMicrosoftToken = async (userProfile: User | null): Promise<string | null> => {
  if (!userProfile) return null;
  const msUser = userProfile as any;
  if (!msUser.microsoftConnected || !msUser.microsoftRefreshToken) {
    return msUser.microsoftAccessToken || null;
  }

  // 아직 만료시간까지 5분(300초) 이상 여유가 있다면 기존 토큰 사용
  const expiresAt = msUser.microsoftTokenExpiresAt || 0;
  if (msUser.microsoftAccessToken && Date.now() < expiresAt - 5 * 60 * 1000) {
    return msUser.microsoftAccessToken;
  }

  console.log('MS To Do 액세스 토큰 만료 임박, 갱신을 시작합니다...');

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', msUser.microsoftRefreshToken);
    params.append('scope', SCOPES);

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!tokenResponse.ok) {
      const errData = await tokenResponse.json();
      throw new Error(`토큰 갱신 API 오류: ${errData.error_description || tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const newAccessToken = tokenData.access_token;
    const newRefreshToken = tokenData.refresh_token || msUser.microsoftRefreshToken;
    const newExpiresAt = Date.now() + parseInt(tokenData.expires_in || '3600') * 1000;

    // Firestore에 갱신된 토큰 영구 저장
    await updateDoc(doc(db, 'users', userProfile.id), {
      microsoftAccessToken: newAccessToken,
      microsoftRefreshToken: newRefreshToken,
      microsoftTokenExpiresAt: newExpiresAt
    });

    // 로컬 메모리 인스턴스 갱신 (연속 호출 시 갱신된 값 사용하도록 보장)
    msUser.microsoftAccessToken = newAccessToken;
    msUser.microsoftRefreshToken = newRefreshToken;
    msUser.microsoftTokenExpiresAt = newExpiresAt;

    console.log('MS To Do 액세스 토큰 자동 갱신 완료!');
    return newAccessToken;
  } catch (err: any) {
    console.error('refreshMicrosoftToken error:', err);
    
    // 만약 토큰이 완전히 만료되었거나 처음부터 없었다면, 갱신 실패 시 폴백하지 않고 에러를 던져 재인증 유도
    if (!msUser.microsoftAccessToken || Date.now() >= expiresAt) {
      throw new Error(`MS To Do 인증 토큰이 만료되었으며 자동 갱신에 실패했습니다. 계정 비밀번호가 바뀌었거나 연동이 만료되었을 수 있습니다. [내 정보 수정] 메뉴에서 연동 해제 후 다시 연동을 시작해 주세요. (원인: ${err.message})`);
    }
    
    // 아직 만료 전이라면 기존 토큰으로 최선을 다해 fallback
    return msUser.microsoftAccessToken;
  }
};

/**
 * 사용자의 Microsoft To Do "YSACC 업무포탈" 리스트 ID 가져오기 또는 생성하기
 */
const getOrCreateTodoList = async (accessToken: string, userProfile: User): Promise<string> => {
  try {
    // Microsoft To Do의 리스트 목록을 실시간으로 가져옵니다 (Stale Cache 방지)
    const listResponse = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const existingList = listData.value?.find(
        (l: any) => l.displayName === 'YSACC 업무포탈'
      );

      if (existingList) {
        // 실시간으로 발견된 리스트 ID로 Firestore를 최신화하고 반환
        if ((userProfile as any).microsoftTodoListId !== existingList.id) {
          await updateDoc(doc(db, 'users', userProfile.id), {
            microsoftTodoListId: existingList.id
          });
        }
        return existingList.id;
      }
    }
  } catch (err) {
    console.warn('실시간 리스트 조회 중 오류 발생, 기존 캐시 ID 사용 시도:', err);
  }

  // 1. 이미 저장된 리스트 ID가 있다면 폴백으로 반환
  if ((userProfile as any).microsoftTodoListId) {
    return (userProfile as any).microsoftTodoListId;
  }

  // 2. 존재하지 않으면 새 리스트 생성
  const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ displayName: 'YSACC 업무포탈' })
  });

  if (!createResponse.ok) {
    let errDetail = '';
    try {
      const errJson = await createResponse.json();
      errDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch (_) {
      try {
        errDetail = await createResponse.text();
      } catch (__) {}
    }
    throw new Error(`Microsoft To Do 리스트 생성 실패 (HTTP ${createResponse.status} ${createResponse.statusText}): ${errDetail || '상세 정보 없음'}`);
  }

  const newListData = await createResponse.json();
  await updateDoc(doc(db, 'users', userProfile.id), {
    microsoftTodoListId: newListData.id
  });

  return newListData.id;
};

/**
 * 1. MS To Do에 신규 태스크 생성 및 동기화
 */
export const syncAddTaskToMsTodo = async (
  task: Omit<Task, 'id' | 'createdAt'>,
  taskId: string,
  userProfile: User | null
): Promise<string | null> => {
  try {
    const token = await refreshMicrosoftToken(userProfile);
    if (!token) {
      console.warn('MS To Do 연동 토큰이 존재하지 않거나 만료되었습니다.');
      return null;
    }

    const listId = await getOrCreateTodoList(token, userProfile!);

    const body: any = {
      title: task.title,
      body: {
        content: task.description || 'YSACC 업무포탈에서 생성된 업무입니다.',
        contentType: 'text'
      },
      importance: task.importance === 'A' ? 'high' : 'normal'
    };

    if (task.dueDate) {
      body.dueDateTime = {
        dateTime: task.dueDate + 'T18:00:00',
        timeZone: 'Korea Standard Time'
      };
    }

    const response = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error('MS To Do 태스크 생성 API 호출 실패');
    }

    const data = await response.json();
    
    // 생성된 MS Task ID를 YSACC 태스크 Firestore 문서에 저장
    await updateDoc(doc(db, 'tasks', taskId), {
      microsoftTaskId: data.id
    });

    return data.id;
  } catch (error) {
    console.error('syncAddTaskToMsTodo error:', error);
    return null;
  }
};

/**
 * 2. MS To Do에 기존 태스크 변경사항 동기화 (수정 및 상태 변경)
 */
export const syncUpdateTaskToMsTodo = async (
  task: Task,
  userProfile: User | null
): Promise<void> => {
  try {
    const token = await refreshMicrosoftToken(userProfile);
    if (!token) return;

    const msTaskId = (task as any).microsoftTaskId;
    if (!msTaskId) {
      // YSACC에는 존재하나 MS To Do에 아직 동기화되지 않았다면 생성
      const { id, createdAt, ...rest } = task;
      await syncAddTaskToMsTodo(rest, task.id, userProfile);
      return;
    }

    const listId = await getOrCreateTodoList(token, userProfile!);

    const body: any = {
      title: task.title,
      body: {
        content: task.description || 'YSACC 업무포탈에서 관리되는 업무입니다.',
        contentType: 'text'
      },
      importance: task.importance === 'A' ? 'high' : 'normal',
      status: task.status === 'DONE' ? 'completed' : 'notStarted'
    };

    if (task.dueDate) {
      body.dueDateTime = {
        dateTime: task.dueDate + 'T18:00:00',
        timeZone: 'Korea Standard Time'
      };
    } else {
      body.dueDateTime = null;
    }

    await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${msTaskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error('syncUpdateTaskToMsTodo error:', error);
  }
};

/**
 * 3. MS To Do에서 태스크 제거 동기화
 */
export const syncDeleteTaskFromMsTodo = async (
  task: Task,
  userProfile: User | null
): Promise<void> => {
  try {
    const token = await refreshMicrosoftToken(userProfile);
    if (!token) return;

    const msTaskId = (task as any).microsoftTaskId;
    if (!msTaskId) return;

    const listId = await getOrCreateTodoList(token, userProfile!);

    await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks/${msTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (error) {
    console.error('syncDeleteTaskFromMsTodo error:', error);
  }
};

/**
 * 4. MS To Do -> YSACC 양방향 업무 상태 및 신규 업무 동기화
 */
export const syncMsTodoToFirebase = async (
  userProfile: User | null,
  currentTasks: Task[]
): Promise<{ added: number; updated: number; debugInfo?: string }> => {
  const token = await refreshMicrosoftToken(userProfile);
  if (!token) {
    return { added: 0, updated: 0, debugInfo: '연동 상태 아님' };
  }

  let added = 0;
  let updated = 0;

  try {
    // 1. Microsoft To Do의 모든 목록 조회
    const listResponse = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!listResponse.ok) {
      let errDetail = '';
      try {
        const errJson = await listResponse.json();
        errDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch (_) {
        try {
          errDetail = await listResponse.text();
        } catch (__) {}
      }
      throw new Error(`Microsoft To Do 리스트 목록 조회 실패 (HTTP ${listResponse.status} ${listResponse.statusText}): ${errDetail || '상세 정보 없음'}`);
    }

    const listData = await listResponse.json();
    const allLists = listData.value || [];
    
    // 디버그 정보 생성 (전체 리스트 이름 나열)
    const listNames = allLists.map((l: any) => `'${l.displayName}'`).join(', ');
    const debugInfo = `계정 내 발견된 목록 총 ${allLists.length}개: [${listNames}]`;
    
    // "YSACC 업무포탈" 이름을 가진 모든 리스트 필터링 (공유 목록 & 중복 목록 전수 동기화)
    const targetLists = allLists.filter((l: any) => l.displayName === 'YSACC 업무포탈');

    if (targetLists.length === 0) {
      // 리스트가 아예 없으면 기본 리스트 생성 처리
      await getOrCreateTodoList(token, userProfile!);
      return { added: 0, updated: 0, debugInfo: `${debugInfo} (YSACC 리스트 발견 안됨)` };
    }

    // 2. 검색된 모든 대상 리스트에서 태스크를 전부 긁어옵니다
    let msTasks: any[] = [];
    for (const targetList of targetLists) {
      try {
        const taskResponse = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${targetList.id}/tasks`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (taskResponse.ok) {
          const taskData = await taskResponse.json();
          if (taskData.value && taskData.value.length > 0) {
            msTasks = [...msTasks, ...taskData.value];
          }
        }
      } catch (err) {
        console.warn(`리스트(${targetList.id}) 태스크 로드 실패:`, err);
      }
    }

    const batch = writeBatch(db);
    let hasChanges = false;

    // 중복 제거용 Set (여러 리스트에 동일 ID의 태스크가 있을 수 있으므로 방지)
    const processedTaskIds = new Set<string>();

    for (const msTask of msTasks) {
      if (processedTaskIds.has(msTask.id)) continue;
      processedTaskIds.add(msTask.id);

      // 1. 이미 연동 매칭된 태스크가 있는지 찾기
      const existingTask = currentTasks.find(
        (t) => (t as any).microsoftTaskId === msTask.id
      );

      // MS To Do의 완료 여부에 맞춰 상태값 맵핑
      const msStatus = msTask.status === 'completed' ? 'DONE' : 'TODO';

      if (existingTask) {
        // 이미 연동되어 있는 경우, 완료 상태가 달라졌다면 YSACC 측의 상태 변경
        if (existingTask.status !== msStatus) {
          const taskRef = doc(db, 'tasks', existingTask.id);
          batch.update(taskRef, {
            status: msStatus,
            updatedAt: new Date().toISOString(),
            completedAt: msStatus === 'DONE' ? new Date().toISOString() : null
          });
          hasChanges = true;
          updated++;
        }
      } else {
        // 2. YSACC에 없는 신규 태스크면 새로 추가
        const newTaskRef = doc(collection(db, 'tasks'));
        
        const newTaskData = {
          title: msTask.title,
          description: msTask.body?.content || 'Microsoft To Do에서 가져온 업무입니다.',
          status: msStatus,
          type: 'DAILY',
          scheduleType: 'SELF',
          assigneeId: userProfile!.id,
          assigneeName: userProfile!.name,
          importance: msTask.importance === 'high' ? 'A' : 'B',
          urgency: 5,
          quadrant: msTask.importance === 'high' ? 'Q1' : 'Q2',
          visibility: 'PUBLIC',
          microsoftTaskId: msTask.id,
          createdAt: msTask.createdDateTime || new Date().toISOString(),
          updatedAt: msTask.lastModifiedDateTime || new Date().toISOString(),
          completedAt: msStatus === 'DONE' ? (msTask.completedDateTime?.dateTime || new Date().toISOString()) : null
        };

        batch.set(newTaskRef, newTaskData);
        hasChanges = true;
        added++;
      }
    }

    if (hasChanges) {
      await batch.commit();
      console.log('Microsoft To Do 업무 동기화 일괄 적용 성공!');
    }

    // 3. YSACC에만 존재하고 MS To Do에 아직 동기화되지 않은 기존 업무들을 MS To Do로 일괄 업로드 (동방향 추가)
    const unsyncedTasks = currentTasks.filter(
      (t) => !(t as any).microsoftTaskId && t.status !== 'DONE'
    );

    for (const unsyncedTask of unsyncedTasks) {
      try {
        const { id, createdAt, ...taskData } = unsyncedTask;
        // MS To Do로 밀어내어 추가하고 Firestore에 ID 동기화
        await syncAddTaskToMsTodo(taskData, unsyncedTask.id, userProfile);
        added++;
      } catch (err) {
        console.warn(`YSACC -> MS To Do 역동기화 업로드 실패: ${unsyncedTask.title}`, err);
      }
    }

    return { added, updated, debugInfo };
  } catch (error) {
    console.error('syncMsTodoToFirebase error:', error);
    throw error;
  }
};
