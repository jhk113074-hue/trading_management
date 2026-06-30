import React from 'react';

export const previewFile = (url: string, name: string) => {
  // PDF나 이미지 파일의 경우 브라우저가 제공하는 깔끔한 자체 뷰어(새 탭/새 창)로 열어 대조 가능하도록 처리
  if (url) {
    window.open(url, '_blank');
  }
  window.dispatchEvent(new CustomEvent('preview-file', { detail: { url, name } }));
};

export const FilePreviewModal: React.FC = () => {
  // window.open 으로 새 창에 바로 띄우기 때문에 메인 윈도우 내부에서는 더 이상 차단 모달을 띄우지 않습니다.
  return null;
};
