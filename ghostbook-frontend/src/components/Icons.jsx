/* Hand-drawn inline icons. 1.5px stroke, slightly uneven on purpose. */

function Icon({ size = 18, children, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CopyIcon = (props) => (
  <Icon {...props}>
    <path d="M8.6 8.4c0-1 .7-1.7 1.7-1.7h7.6c1 0 1.8.7 1.8 1.7v8.9c0 1-.8 1.7-1.8 1.7h-7.5c-1 0-1.8-.7-1.8-1.7z" />
    <path d="M5.4 15.2c-.9-.2-1.5-.9-1.5-1.8V6.6c0-1 .8-1.9 1.9-1.9h7" />
  </Icon>
);

export const EditIcon = (props) => (
  <Icon {...props}>
    <path d="M4.2 19.8l.9-4.1L16.6 4.3a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.5L8.3 18.9z" />
    <path d="M14.6 6.4l3.1 3.2" />
  </Icon>
);

export const TrashIcon = (props) => (
  <Icon {...props}>
    <path d="M4.5 6.8h15" />
    <path d="M9.2 6.6V4.9c0-.6.5-1 1-1h3.7c.6 0 1.1.4 1.1 1v1.7" />
    <path d="M6.4 6.9l.8 11.8c.1.8.7 1.4 1.5 1.4h6.6c.8 0 1.4-.6 1.5-1.4l.8-11.8" />
    <path d="M10.2 10.5v6M13.9 10.5v6" />
  </Icon>
);

export const SearchIcon = (props) => (
  <Icon {...props}>
    <circle cx="10.6" cy="10.4" r="6.1" />
    <path d="M15.2 15.1l4.6 4.7" />
  </Icon>
);

export const LockIcon = (props) => (
  <Icon {...props}>
    <path d="M6.2 11.1h11.7c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H6.2c-.7 0-1.2-.5-1.2-1.2v-6.6c0-.7.5-1.2 1.2-1.2z" />
    <path d="M8.2 11V8.2a3.9 3.9 0 0 1 7.7-.3V11" />
    <path d="M12 14.6v2" />
  </Icon>
);

export const PlusIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4.6v14.9M4.7 12.1h14.7" />
  </Icon>
);

export const PasteIcon = (props) => (
  <Icon {...props}>
    <path d="M8.2 5.3H6.4c-.9 0-1.6.7-1.6 1.6v11.7c0 .9.7 1.6 1.6 1.6h11.2c.9 0 1.6-.7 1.6-1.6V6.9c0-.9-.7-1.6-1.6-1.6h-1.8" />
    <path d="M9 4.1c0-.6.5-1 1-1h4c.6 0 1.1.4 1.1 1v1.6c0 .6-.5 1-1.1 1H10c-.5 0-1-.4-1-1z" />
    <path d="M8.6 12h6.8M8.6 15.6h4.4" />
  </Icon>
);

export const ExternalIcon = (props) => (
  <Icon {...props}>
    <path d="M13.2 4.6h6.2v6.1" />
    <path d="M19.4 4.7l-8.1 8.2" />
    <path d="M17.6 14v4.2c0 .8-.6 1.4-1.4 1.4H5.9c-.8 0-1.4-.6-1.4-1.4V8c0-.8.6-1.4 1.4-1.4H10" />
  </Icon>
);

export const ChevronIcon = (props) => (
  <Icon {...props}>
    <path d="M6.3 9.3l5.8 5.7 5.7-5.8" />
  </Icon>
);

export const WarningIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4.2c.4 0 .7.2.9.5l8 13.4c.4.7-.1 1.5-.9 1.5H4c-.8 0-1.3-.8-.9-1.5l8-13.4c.2-.3.5-.5.9-.5z" />
    <path d="M12 9.8v4.4" />
    <path d="M12 16.9v.2" />
  </Icon>
);

/** A candle: the mark for the book. Only the flame flickers. */
export function CandleGlyph({ size = 24, className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M8.2 21V11.6c0-.9.8-1.6 1.7-1.6h4.3c.9 0 1.7.7 1.7 1.6V21" />
      <path d="M5.6 21.1h12.9" />
      <path d="M13.8 12.4c0 1.4-.2 2.5.1 3.4" />
      <path
        className="glyph__flame flicker"
        d="M12 8.4c-2.2-2-2.6-4.3-.1-7 .5 2 3.4 3.5.1 7z"
      />
    </svg>
  );
}

export function Wordmark({ size = "md" }) {
  return (
    <span className="wordmark" data-size={size}>
      <CandleGlyph className="wordmark__glyph" />
      <span className="wordmark__text">Ghostbook</span>
    </span>
  );
}