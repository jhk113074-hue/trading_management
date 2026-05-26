import React from 'react';

export const ContainerPacker: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', margin: '-24px', overflow: 'hidden' }}>
      <iframe
        src="/container/index.html"
        title="컨테이너 적재 프로그램"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          flex: 1,
        }}
        allow="clipboard-write"
      />
    </div>
  );
};
