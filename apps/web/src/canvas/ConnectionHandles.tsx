import { Handle, Position } from '@xyflow/react';

/**
 * The connection points of a node. A connection can leave from and arrive at any side, so each
 * side has a point for both. By default edges arrive at the left and the top and leave by the
 * right and the bottom: of these, the arriving points are invisible, and the two leaving ones
 * show a dot on hover or when the node is selected, to drag a new connection from. The other
 * four are there for the connections whose sides were chosen by hand, and are invisible too.
 * They stay outside the animated card of the node: React Flow measures where they are when the
 * node mounts, and measuring them mid-entrance, scaled down, made edges end inside the node.
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
        type="source"
        position={Position.Left}
        isConnectable={false}
        className="flow-handle pointer-events-none"
      />
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={false}
        className="flow-handle pointer-events-none"
      />
      <Handle
        id="right"
        type="target"
        position={Position.Right}
        isConnectable={false}
        className="flow-handle pointer-events-none"
      />
      <Handle
        id="bottom"
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className="flow-handle pointer-events-none"
      />
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
