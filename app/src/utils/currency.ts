import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_CURRENCIES = ['USD', 'CNY', 'EUR', 'KRW'];

export function subscribeCustomCurrencies(callback: (list: string[]) => void) {
  const companyRef = doc(db, 'companies', 'YSACC');
  return onSnapshot(companyRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data().customCurrencies || []);
    } else {
      callback([]);
    }
  }, (err) => {
    console.error("Failed to subscribe custom currencies:", err);
  });
}

export async function addCustomCurrency(newCode: string, currentList: string[]): Promise<string | null> {
  const code = newCode.trim().toUpperCase();
  if (code.length !== 3) {
    alert("통화 코드는 3자리 영문이어야 합니다.");
    return null;
  }
  if ([...DEFAULT_CURRENCIES, ...currentList].includes(code)) {
    alert("이미 등록된 통화 코드입니다.");
    return code;
  }
  try {
    const companyRef = doc(db, 'companies', 'YSACC');
    const docSnap = await getDoc(companyRef);
    const serverList = docSnap.exists() ? (docSnap.data().customCurrencies || []) : [];
    if (!serverList.includes(code)) {
      const nextList = [...serverList, code];
      await setDoc(companyRef, { customCurrencies: nextList }, { merge: true });
    }
    return code;
  } catch (err) {
    console.error("Failed to add custom currency to Firestore:", err);
    return null;
  }
}

export async function handleCurrencySelection(
  selectedVal: string,
  currentVal: string,
  customCurrencies: string[],
  callback: (newVal: string) => void
) {
  if (selectedVal === 'ADD_NEW_CURRENCY') {
    const code = prompt("새로운 외환 통화 코드를 입력하세요 (예: JPY, AED, GBP):");
    if (code) {
      const added = await addCustomCurrency(code, customCurrencies);
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
