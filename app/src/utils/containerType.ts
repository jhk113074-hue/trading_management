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

/**
 * Merges any incidental logistics charges (부대비용) into CIF CHARGES, FOB CHARGES,
 * or the primary container freight charge row so that incidental charges are never
 * displayed separately in PI documents/PDF/Excel.
 */
export function mergeIncidentalIntoFreightCharges(freightCharges: any[]): any[] {
  if (!Array.isArray(freightCharges) || freightCharges.length === 0) return [];

  const isIncidental = (typeOrName?: string) => {
    if (!typeOrName) return false;
    const str = typeOrName.toLowerCase();
    return str.includes('부대비용') || str.includes('incidental') || str.includes('세부 부대비용');
  };

  const incidentalRows = freightCharges.filter(fc => isIncidental(fc.type || fc.name));
  const mainRows = freightCharges.filter(fc => !isIncidental(fc.type || fc.name));

  if (incidentalRows.length === 0) {
    return freightCharges.map(fc => ({ ...fc }));
  }

  const totalIncidental = incidentalRows.reduce((sum, r) => {
    const amt = typeof r.amount === 'number' ? r.amount : (Number(r.qty || 1) * Number(r.price || 0));
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  if (mainRows.length === 0) {
    return [{
      type: 'CIF CHARGES',
      name: 'CIF CHARGES',
      qty: 1,
      price: parseFloat(totalIncidental.toFixed(2)),
      amount: parseFloat(totalIncidental.toFixed(2)),
      remarks: '-'
    }];
  }

  const result = mainRows.map(r => ({ ...r }));

  // Priority 1: A row whose type/name explicitly contains 'CIF', 'FOB', or 'CFR'
  let targetIndex = result.findIndex(r => {
    const t = (r.type || r.name || '').toUpperCase();
    return t.includes('CIF') || t.includes('FOB') || t.includes('CFR');
  });

  // Priority 2: If none has CIF/FOB/CFR, merge into the first container row
  if (targetIndex === -1) {
    targetIndex = 0;
  }

  const target = result[targetIndex];
  const oldAmount = typeof target.amount === 'number' ? target.amount : (Number(target.qty || 1) * Number(target.price || 0));
  const newAmount = parseFloat((oldAmount + totalIncidental).toFixed(2));
  const qty = Number(target.qty || 1);
  const newPrice = parseFloat((newAmount / (qty > 0 ? qty : 1)).toFixed(2));

  result[targetIndex] = {
    ...target,
    price: newPrice,
    amount: newAmount
  };

  return result;
}
