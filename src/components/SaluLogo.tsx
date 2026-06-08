export default function SaluLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <rect x="7" y="13" width="18" height="14" rx="4" fill="white" fillOpacity="0.95" />
      {/* Head */}
      <rect x="10" y="5" width="12" height="10" rx="3" fill="white" fillOpacity="0.95" />
      {/* Antenna */}
      <line x1="16" y1="2" x2="16" y2="5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="1.5" r="1.5" fill="#ee742f" />
      {/* Eyes */}
      <rect x="12" y="8" width="3" height="2" rx="0.5" fill="#2b4c9c" />
      <rect x="17" y="8" width="3" height="2" rx="0.5" fill="#2b4c9c" />
      {/* Smile */}
      <path d="M13 12 Q16 14 19 12" stroke="#2b4c9c" strokeWidth="1" strokeLinecap="round" fill="none" />
      {/* Cross / health icon on body */}
      <rect x="15" y="17" width="2" height="6" rx="1" fill="#ee742f" />
      <rect x="13" y="19" width="6" height="2" rx="1" fill="#ee742f" />
    </svg>
  );
}
