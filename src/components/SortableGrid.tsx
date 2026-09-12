import type { ReactNode } from 'react';
import {
  closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Props<T> = {
  items: T[];
  getId: (item: T) => string;
  label: (item: T) => string; // spoken by screen readers while dragging
  onMove: (fromId: string, toId: string) => void;
  children: (item: T) => ReactNode;
};

// Drag with mouse, long-press on touch, or Space/arrow keys on a focused card.
export function SortableGrid<T>({ items, getId, label, onMove, children }: Props<T>) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // small threshold keeps clicks as clicks
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }), // swipe still scrolls
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const name = (id: string | number) => {
    const i = ids.indexOf(String(id));
    return i < 0 ? 'item' : label(items[i]);
  };
  const pos = (id: string | number | undefined) => `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
          onDragOver: ({ active, over }) => (over ? `${name(active.id)} moved to ${pos(over.id)}.` : undefined),
          onDragEnd: ({ active, over }) => (over ? `Dropped ${name(active.id)} at ${pos(over.id)}.` : `Dropped ${name(active.id)}.`),
          onDragCancel: ({ active }) => `Cancelled. ${name(active.id)} was not moved.`,
        },
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ul className="grid">
          {items.map((item) => (
            <Item key={getId(item)} id={getId(item)} label={label(item)}>{children(item)}</Item>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Item({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, attributes: { role: 'listitem' } });
  return (
    <li
      ref={(node) => { setNodeRef(node); setActivatorNodeRef(node); }}
      className={isDragging ? 'card dragging' : 'card'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      {children}
    </li>
  );
}
