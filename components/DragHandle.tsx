'use client';

import { useState, useCallback, useRef } from 'react';

const GOLD = '#C8960F';
const RAISED = '#ffffff';
const BORDER = '#E2E5EA';
const DIM = '#6B7280';

/* ──────────────────────────────────────────────
   useDragReorder hook
   ──────────────────────────────────────────── */

interface DragHandlers {
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

export function useDragReorder<T>(
  items: T[],
  onReorder: (items: T[]) => void,
): { dragHandlers: (index: number) => DragHandlers; draggingIndex: number | null } {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  const dragHandlers = useCallback(
    (index: number): DragHandlers => ({
      onDragStart: (e: React.DragEvent) => {
        setDraggingIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        dragOverIndexRef.current = index;
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIndex = index;

        if (fromIndex === toIndex || isNaN(fromIndex)) {
          setDraggingIndex(null);
          return;
        }

        const updated = [...items];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        onReorder(updated);
        setDraggingIndex(null);
        dragOverIndexRef.current = null;
      },
      onDragEnd: () => {
        setDraggingIndex(null);
        dragOverIndexRef.current = null;
      },
    }),
    [items, onReorder],
  );

  return { dragHandlers, draggingIndex };
}

/* ──────────────────────────────────────────────
   DragHandle component
   ──────────────────────────────────────────── */

interface DragHandleProps {
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  index: number;
  isDragging: boolean;
}

export default function DragHandle({
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  index,
  isDragging,
}: DragHandleProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => {
        onDragOver(e);
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(e) => {
        onDrop(e);
        setIsDropTarget(false);
      }}
      onDragEnd={(e) => {
        onDragEnd?.(e);
        setIsDropTarget(false);
      }}
      data-drag-index={index}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        cursor: isDragging ? 'grabbing' : 'grab',
        background: isDropTarget ? GOLD : isDragging ? RAISED : 'transparent',
        border: isDropTarget ? `2px solid ${GOLD}` : '2px solid transparent',
        transform: isDragging ? 'scale(1.08)' : 'scale(1)',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.4)' : 'none',
        opacity: isDragging ? 0.85 : 1,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
        flexShrink: 0,
        userSelect: 'none',
        touchAction: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          (e.currentTarget as HTMLDivElement).style.background = BORDER;
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging && !isDropTarget) {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }
      }}
      aria-label={`Drag to reorder item ${index + 1}`}
      role="button"
      tabIndex={0}
    >
      {/* 6-dot grip pattern (2 columns x 3 rows) */}
      <svg
        width="14"
        height="18"
        viewBox="0 0 14 18"
        fill={isDropTarget ? RAISED : DIM}
      >
        <circle cx="4" cy="3" r="1.5" />
        <circle cx="10" cy="3" r="1.5" />
        <circle cx="4" cy="9" r="1.5" />
        <circle cx="10" cy="9" r="1.5" />
        <circle cx="4" cy="15" r="1.5" />
        <circle cx="10" cy="15" r="1.5" />
      </svg>
    </div>
  );
}
