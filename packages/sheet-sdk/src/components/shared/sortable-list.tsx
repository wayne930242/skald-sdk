// components/shared/sortable-list.tsx
"use client";

import * as React from "react";
import { cn } from "@skald/sheet-sdk/lib/utils";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ============================================================================
// Types
// ============================================================================

/**
 * Base interface for sortable items. All items must have a unique `id`.
 */
export interface SortableItem {
  id: string;
}

/**
 * Props passed to the drag handle, enabling drag-and-drop interaction.
 */
export interface DragHandleProps {
  /** Ref callback to attach to the drag handle element */
  ref: (node: HTMLElement | null) => void;
  /** Accessibility attributes (role, tabIndex, aria-*) */
  attributes: React.HTMLAttributes<HTMLElement>;
  /** Event listeners for drag interactions */
  listeners: Record<string, (...args: unknown[]) => void> | undefined;
  /** Whether the item is currently being dragged */
  isDragging: boolean;
}

/**
 * Props for the SortableList component.
 */
export interface SortableListProps<T extends SortableItem> {
  /** Array of items to render */
  items: T[];
  /** Callback when items are reordered */
  onReorder: (items: T[]) => void;
  /** Render function for each item */
  renderItem: (
    item: T,
    index: number,
    dragHandleProps: DragHandleProps
  ) => React.ReactNode;
  /** Whether drag-and-drop is disabled */
  disabled?: boolean;
  /** Additional CSS class for the wrapper */
  className?: string;
  /** Additional CSS class for each item wrapper */
  itemClassName?: string;
  /** Layout direction for the list */
  direction?: "vertical" | "horizontal";
}

// ============================================================================
// DragHandle Component
// ============================================================================

export interface DragHandleComponentProps extends DragHandleProps {
  /** Additional CSS class */
  className?: string;
}

/**
 * A standalone drag handle component with a grip icon.
 * Can be used within the renderItem function for customized placement.
 */
export function DragHandle({
  ref,
  attributes,
  listeners,
  isDragging,
  className,
}: DragHandleComponentProps) {
  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      {...attributes}
      {...(listeners as React.HTMLAttributes<HTMLDivElement>)}
      className={cn(
        "cursor-grab active:cursor-grabbing touch-none print:hidden",
        isDragging && "cursor-grabbing",
        className
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// ============================================================================
// SortableListItem Component (Internal)
// ============================================================================

interface SortableListItemProps<T extends SortableItem> {
  item: T;
  index: number;
  disabled: boolean;
  renderItem: SortableListProps<T>["renderItem"];
  className?: string;
}

function SortableListItem<T extends SortableItem>({
  item,
  index,
  disabled,
  renderItem,
  className,
}: SortableListItemProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragHandleProps: DragHandleProps = {
    ref: setActivatorNodeRef,
    attributes: attributes as React.HTMLAttributes<HTMLElement>,
    listeners: listeners as Record<string, (...args: unknown[]) => void> | undefined,
    isDragging: disabled ? false : isDragging,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 z-10", className)}
    >
      {renderItem(item, index, dragHandleProps)}
    </div>
  );
}

// ============================================================================
// SortableList Component
// ============================================================================

/**
 * A generic sortable list component using @dnd-kit.
 *
 * @example
 * ```tsx
 * <SortableList
 *   items={skills}
 *   onReorder={setSkills}
 *   renderItem={(item, index, dragHandleProps) => (
 *     <div className="flex items-center gap-2">
 *       <DragHandle {...dragHandleProps} />
 *       <span>{item.name}</span>
 *     </div>
 *   )}
 * />
 * ```
 */
export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  className,
  itemClassName,
  direction = "vertical",
}: SortableListProps<T>) {
  // Configure sensors for pointer and keyboard interactions
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require 8px movement to start drag (prevents accidental drags)
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end event
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(items, oldIndex, newIndex);
          onReorder(newItems);
        }
      }
    },
    [items, onReorder]
  );

  // Select sorting strategy based on direction
  const sortingStrategy =
    direction === "horizontal"
      ? horizontalListSortingStrategy
      : verticalListSortingStrategy;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={sortingStrategy}
      >
        <div
          className={cn(
            "flex",
            direction === "vertical" ? "flex-col" : "flex-row",
            className
          )}
        >
          {items.map((item, index) => (
            <SortableListItem
              key={item.id}
              item={item}
              index={index}
              disabled={disabled}
              renderItem={renderItem}
              className={itemClassName}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
