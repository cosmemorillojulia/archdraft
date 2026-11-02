import { Handle, Position } from '@xyflow/react';

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const;

/**
 * The connection points of a node, one in the middle of each side, as in draw.io. Each shows
 * a dot on hover or when the node is selected, to drag a new connection from, which then
 * leaves by that side. While a connection is dragged, the dots of the node under the pointer
 * show where it can arrive: let go on one and it arrives by that side, anywhere else on the
 * node and the side is the one that makes the shortest line. Each side also has an invisible
 * target point at the same place, which edges attach to and which a connection snaps to when
 * the pointer comes near; the canvas connects in loose mode, so a connection let go right on a
 * dot, which is a source point, arrives there too.
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
      {SIDES.map(({ id, position }) => (
        <Handle
          key={`${id}-target`}
          id={id}
          type="target"
          position={position}
          isConnectable={isConnectable}
          className="flow-handle arrive-handle pointer-events-none"
        />
      ))}
      {SIDES.map(({ id, position }) => (
        <Handle
          key={`${id}-source`}
          id={id}
          type="source"
          position={position}
          isConnectable={isConnectable}
          data-selected={selected || undefined}
          className="flow-handle connect-handle"
        />
      ))}
    </>
  );
}
