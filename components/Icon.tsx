type IconProps = {
  name: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function Icon({ name, className, style }: IconProps) {
  return (
    <span className={`material-symbols-outlined icon${className ? ` ${className}` : ""}`} style={style} aria-hidden="true">
      {name}
    </span>
  );
}
