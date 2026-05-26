import { useState, useCallback, useRef } from 'react';

/**
 * useColumnResize - 마우스 드래그로 테이블 컬럼 너비를 조정하는 훅
 * @param initialWidths 각 컬럼의 초기 너비 (px)
 */
export function useColumnResize(initialWidths: number[]) {
  const [colWidths, setColWidths] = useState<number[]>(initialWidths);
  const dragging = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback((colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = { colIdx, startX: e.clientX, startWidth: colWidths[colIdx] };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragging.current) return;
      const delta = moveEvent.clientX - dragging.current.startX;
      const newWidth = Math.max(40, dragging.current.startWidth + delta);
      setColWidths(prev => {
        const next = [...prev];
        next[dragging.current!.colIdx] = newWidth;
        return next;
      });
    };

    const onMouseUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  /**
   * th에 적용할 스타일 반환 (position relative 포함)
   */
  const thStyle = useCallback((colIdx: number, extraStyle: React.CSSProperties = {}): React.CSSProperties => ({
    position: 'relative',
    width: colWidths[colIdx],
    minWidth: colWidths[colIdx],
    maxWidth: colWidths[colIdx],
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    ...extraStyle,
  }), [colWidths]);

  /**
   * 컬럼 오른쪽 끝에 붙이는 리사이즈 핸들 props 반환
   */
  const resizerProps = useCallback((colIdx: number) => ({
    onMouseDown: (e: React.MouseEvent) => onMouseDown(colIdx, e),
    style: {
      position: 'absolute' as const,
      right: 0,
      top: 0,
      bottom: 0,
      width: '5px',
      cursor: 'col-resize',
      zIndex: 1,
      background: 'transparent',
      transition: 'background 0.15s',
    } as React.CSSProperties,
    onMouseEnter: (e: React.MouseEvent) => {
      (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.25)';
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (e.currentTarget as HTMLElement).style.background = 'transparent';
    },
  }), [onMouseDown]);

  return { colWidths, thStyle, resizerProps };
}
