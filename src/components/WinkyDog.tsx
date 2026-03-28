interface WinkyDogProps {
  className?: string;
}

export function WinkyDog({ className }: WinkyDogProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 280 250"
      role="img"
      aria-label="Winky the dog wearing a little engineering hat"
    >
      <defs>
        <linearGradient id="winky-hat" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd45a" />
          <stop offset="100%" stopColor="#ff9e2c" />
        </linearGradient>
        <linearGradient id="winky-fur" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffdfb9" />
          <stop offset="100%" stopColor="#d98b4d" />
        </linearGradient>
        <linearGradient id="winky-ear" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7a4a2a" />
          <stop offset="100%" stopColor="#4a2a15" />
        </linearGradient>
      </defs>

      <ellipse cx="154" cy="224" rx="84" ry="18" fill="rgba(24, 53, 88, 0.18)" />

      <path d="M102 52l24-24h55l18 22-18 13h-63z" fill="url(#winky-hat)" stroke="#1f314d" strokeWidth="8" />
      <path d="M118 54h70" stroke="#fff1a8" strokeWidth="8" strokeLinecap="round" />
      <circle cx="149" cy="53" r="10" fill="#4ccfd0" stroke="#1f314d" strokeWidth="7" />

      <path d="M88 92c-20-21-36-12-41 13-3 15 0 33 20 42z" fill="url(#winky-ear)" stroke="#1f314d" strokeWidth="8" />
      <path d="M210 92c20-21 36-12 41 13 3 15 0 33-20 42z" fill="url(#winky-ear)" stroke="#1f314d" strokeWidth="8" />

      <path
        d="M83 104c0-48 33-72 68-72 39 0 76 23 76 72v39c0 45-36 79-79 79-41 0-65-26-65-70z"
        fill="url(#winky-fur)"
        stroke="#1f314d"
        strokeWidth="8"
      />

      <ellipse cx="121" cy="126" rx="14" ry="21" fill="#ffffff" stroke="#1f314d" strokeWidth="7" />
      <ellipse cx="177" cy="126" rx="14" ry="21" fill="#ffffff" stroke="#1f314d" strokeWidth="7" />
      <circle cx="125" cy="129" r="6" fill="#1f314d" />
      <circle cx="173" cy="125" r="6" fill="#1f314d" />
      <circle cx="178" cy="122" r="2.5" fill="#ffffff" />

      <path d="M132 156c6-10 16-15 28-15s22 5 28 15c-1 12-13 25-27 25-16 0-26-10-29-25z" fill="#fff8ef" stroke="#1f314d" strokeWidth="8" />
      <ellipse cx="160" cy="156" rx="11" ry="8" fill="#2d1f1b" />
      <path d="M149 175c5 6 12 9 21 9 8 0 15-3 20-9" stroke="#1f314d" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M160 178c0 8 6 15 13 17-1-10 0-16 4-25-6 3-12 5-17 8z" fill="#ff6b8c" stroke="#1f314d" strokeWidth="5" />

      <path d="M100 190c13 20 38 31 60 31 23 0 44-8 57-23" stroke="#1f314d" strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M93 188c17 10 37 12 50 7" stroke="#1f314d" strokeWidth="8" strokeLinecap="round" fill="none" />

      <path d="M92 174c-8 0-17 6-17 17 0 11 9 20 21 20 13 0 24-7 24-18 0-10-12-19-28-19z" fill="#ffefe1" stroke="#1f314d" strokeWidth="8" />

      <path d="M177 196c8 15 23 25 39 26 12 1 18-8 18-17 0-11-10-21-26-23" fill="#4ccfd0" stroke="#1f314d" strokeWidth="8" />
      <path d="M160 210c18 1 33-1 46-7" stroke="#1f314d" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="218" cy="207" r="6" fill="#ffffff" />
    </svg>
  );
}
