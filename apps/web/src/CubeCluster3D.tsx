export function IsometricCube({
  x,
  y,
  size = 20,
  top,
  left,
  right,
  shadow,
}: {
  x: number;
  y: number;
  size?: number;
  top: string;
  left: string;
  right: string;
  shadow: string;
}) {
  const dx = size * 0.866;
  const dy = size * 0.5;
  const h = size;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon
        points={`6,${dy * 2 + h + 4} ${dx + 6},${dy + h + 4} 6,${h + 4} ${-dx + 6},${dy + h + 4}`}
        fill={shadow}
      />
      <polygon
        points={`0,0 ${dx},${dy} 0,${dy * 2} ${-dx},${dy}`}
        fill={top}
        stroke="#162535"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <polygon
        points={`${-dx},${dy} 0,${dy * 2} 0,${dy * 2 + h} ${-dx},${dy + h}`}
        fill={left}
        stroke="#162535"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <polygon
        points={`0,${dy * 2} ${dx},${dy} ${dx},${dy + h} 0,${dy * 2 + h}`}
        fill={right}
        stroke="#162535"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </g>
  );
}

export type CubeClusterVariant = "rail" | "empty" | "header" | "badge";

export function CubeCluster3D({
  variant = "header",
  className = "",
}: {
  variant?: CubeClusterVariant;
  className?: string;
}) {
  const classes = `cube-cluster-3d cube-cluster-3d--${variant}${className ? ` ${className}` : ""}`;

  if (variant === "rail") {
    return (
      <svg
        className={`mailbox-cubes mailbox-cubes--rail ${classes}`}
        viewBox="0 0 164 76"
        width="164"
        height="76"
        aria-hidden="true"
      >
        <IsometricCube x={32} y={18} size={17} top="#dfedfa" left="#9cc0ea" right="#315e97" shadow="#d0deec" />
        <IsometricCube x={82} y={8} size={19} top="#e9e5ff" left="#b9adfb" right="#674cfb" shadow="#d7d0f5" />
        <IsometricCube x={132} y={18} size={17} top="#e8f5ef" left="#9cd8c2" right="#226d5c" shadow="#cde6db" />
      </svg>
    );
  }

  if (variant === "empty") {
    return (
      <svg
        className={`mailbox-cubes mailbox-cubes--empty ${classes}`}
        viewBox="0 0 210 112"
        width="210"
        height="112"
        aria-hidden="true"
      >
        <IsometricCube x={42} y={34} size={22} top="#dfedfa" left="#9cc0ea" right="#315e97" shadow="#d0deec" />
        <IsometricCube x={105} y={10} size={26} top="#e9e5ff" left="#b9adfb" right="#674cfb" shadow="#d7d0f5" />
        <IsometricCube x={166} y={32} size={22} top="#fff4d6" left="#f1d286" right="#c49234" shadow="#e7dec1" />
        <IsometricCube x={105} y={56} size={18} top="#e8f5ef" left="#9cd8c2" right="#226d5c" shadow="#cde6db" />
      </svg>
    );
  }

  if (variant === "badge") {
    return (
      <svg
        className={classes}
        viewBox="0 0 88 52"
        width="88"
        height="52"
        aria-hidden="true"
      >
        <IsometricCube x={24} y={12} size={13} top="#e9e5ff" left="#b9adfb" right="#674cfb" shadow="#d7d0f5" />
        <IsometricCube x={58} y={4} size={15} top="#fff0e8" left="#f1baa7" right="#c05a40" shadow="#f2cfc5" />
      </svg>
    );
  }

  return (
    <svg
      className={classes}
      viewBox="0 0 132 64"
      width="132"
      height="64"
      aria-hidden="true"
    >
      <IsometricCube x={24} y={16} size={14} top="#fff4d6" left="#f1d286" right="#c49234" shadow="#e7dec1" />
      <IsometricCube x={66} y={6} size={17} top="#e9e5ff" left="#b9adfb" right="#674cfb" shadow="#d7d0f5" />
      <IsometricCube x={108} y={18} size={14} top="#e8f5ef" left="#9cd8c2" right="#226d5c" shadow="#cde6db" />
    </svg>
  );
}
