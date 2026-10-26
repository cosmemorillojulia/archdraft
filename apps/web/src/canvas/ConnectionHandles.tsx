import { Handle, Position } from '@xyflow/react';

/**
 * The four connection points of a node: edges arrive at the left and the top
 * and leave by the right and the bottom. Arriving points are invisible, and
 * the two leaving ones show a dot on hover or when the node is selected, to
 * drag a new connection from. They stay outside the animated card of the
 * node: React Flow measures where they are when the node mounts, and
 * measuring them mid-entrance, scaled down, made edges end inside the node.
 * The ids are the names of the sides, which edges refer to.
 */
export function ConnectionHandles({
  selected,
  isConnectable,
}: {
  selected: boolean;
  isConnectable: boolean;
}) {
  return (
    <>
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="flow-handle pointer-events-none"
      />
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="flow-handle pointer-events-none"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        data-selected={selected || undefined}
        className="flow-handle connect-handle"
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        data-selected={selected || undefined}
        className="flow-handle connect-handle"
      />
    </>
  );
}
