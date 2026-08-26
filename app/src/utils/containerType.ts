import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_CONTAINER_TYPES = [
  'LCL',
  '20GP',
  '20RF',
  '20DG',
  '40FT',
  '40HQ',
  'FOB CHARGES',
  'CIF CHARGES',
  'CFR CHARGES',
  'DAP CHARGES',
  'DDP CHARGES'
];

const LOCAL_STORAGE_KEY = 'ysacc_custom_container_types';

export function getCachedCustomContainerTypes(): string[] {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Failed to parse cached custom container types:', e);
  }
  return [];
}

export function subscribeCustomContainerTypes(callback: (list: string[]) => void) {
  // Call immediately with cached types if any
  const cached = getCachedCustomContainerTypes();
  if (cached.length > 0) {
    callback(cached);
  }

  const companyRef = doc(db, 'companies', 'YSACC');
  return onSnapshot(companyRef, (docSnap) => {
    if (docSnap.exists()) {
      const serverList = docSnap.data().customContainerTypes || [];
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverList));
      } catch (e) {
        console.warn('Failed to cache custom container types:', e);
      }
      callback(serverList);
    } else {
      callback([]);
    }
  }, (err) => {
    console.error("Failed to subscribe custom container types:", err);
  });
}

export async function addCustomContainerType(newType: string, currentList: string[]): Promise<string | null> {
  const typeName = newType.trim().toUpperCase();
  if (!typeName) {
    alert("컨테이너 / 운임 타입명을 입력해 주세요.");
    return null;
  }
  if ([...DEFAULT_CONTAINER_TYPES, ...currentList].map(t => t.toUpperCase()).includes(typeName)) {
    alert("이미 등록된 컨테이너 / 운임 타입입니다.");
    return typeName;
  }
  try {
    const companyRef = doc(db, 'companies', 'YSACC');
    const docSnap = await getDoc(companyRef);
    const serverList = docSnap.exists() ? (docSnap.data().customContainerTypes || []) : [];
    if (!serverList.map((t: string) => t.toUpperCase()).includes(typeName)) {
      const nextList = [...serverList, typeName];
      await setDoc(companyRef, { customContainerTypes: nextList }, { merge: true });
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList));
      } catch (e) {}
    }
    return typeName;
  } catch (err) {
    console.error("Failed to add custom container type to Firestore:", err);
    // Fallback to local storage if network fails
    const nextList = [...currentList, typeName];
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList));
    } catch (e) {}
    return typeName;
  }
}

export async function handleContainerTypeSelection(
  selectedVal: string,
  currentVal: string,
  customTypes: string[],
  callback: (newVal: string) => void
) {
  if (selectedVal === 'ADD_NEW_CONTAINER_TYPE') {
    const entered = prompt("추가할 새로운 컨테이너 또는 운임 타입을 입력하세요 (예: 20FL, 40NOR, AIR FREIGHT, TRUCK 등):");
    if (entered && entered.trim()) {
      const added = await addCustomContainerType(entered, customTypes);
      if (added) {
        callback(added);
      } else {
        callback(currentVal);
      }
    } else {
      callback(currentVal);
    }
  } else {
    callback(selectedVal);
  }
}
