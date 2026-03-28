interface WinkyDogProps {
  className?: string;
}

export function WinkyDog({ className }: WinkyDogProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 290"
      role="img"
      aria-label="Winky the chihuahua wearing engineering goggles and holding a wrench"
    >
      <defs>
        <linearGradient id="winky-fur-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff4dd" />
          <stop offset="100%" stopColor="#f2b36a" />
        </linearGradient>
        <linearGradient id="winky-fur-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e9893e" />
          <stop offset="100%" stopColor="#b55c23" />
        </linearGradient>
        <linearGradient id="winky-goggle" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#89d9ff" />
          <stop offset="100%" stopColor="#4f9ed4" />
        </linearGradient>
        <linearGradient id="winky-metal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dfe7ef" />
          <stop offset="100%" stopColor="#8b9fb4" />
        </linearGradient>
      </defs>

      <ellipse cx="164" cy="262" rx="92" ry="20" fill="rgba(24, 53, 88, 0.16)" />

      <path d="M86 88c-22-44-10-78 31-74 26 2 44 16 44 40 0 19-8 34-22 51z" fill="url(#winky-fur-dark)" stroke="#2a3442" strokeWidth="8" />
      <path d="M234 88c22-44 10-78-31-74-26 2-44 16-44 40 0 19 8 34 22 51z" fill="url(#winky-fur-dark)" stroke="#2a3442" strokeWidth="8" />
      <path d="M104 96c-5-8-7-17-7-28 0-38 28-58 64-58 36 0 64 20 64 58 0 11-2 20-7 28" fill="#f7d39a" opacity="0.45" />

      <path
        d="M88 110c0-49 30-80 73-80s73 31 73 80v46c0 52-31 88-73 88s-73-36-73-88z"
        fill="url(#winky-fur-light)"
        stroke="#2a3442"
        strokeWidth="8"
      />

      <path d="M120 192c16 16 42 24 70 24 28 0 50-8 64-24v28c0 25-21 41-46 41h-92c-26 0-47-17-47-41v-32c11 12 30 17 44 17z" fill="url(#winky-fur-dark)" stroke="#2a3442" strokeWidth="8" />
      <path d="M130 168c10 13 21 18 33 18 12 0 24-5 33-18" fill="none" stroke="#2a3442" strokeWidth="7" strokeLinecap="round" />
      <path d="M119 156c8-13 22-20 42-20 20 0 34 7 42 20-2 16-18 30-42 30-25 0-39-14-42-30z" fill="#fffaf3" stroke="#2a3442" strokeWidth="8" />
      <ellipse cx="161" cy="154" rx="12" ry="9" fill="#2a1e17" />
      <path d="M152 173c4 6 10 9 18 9 7 0 13-3 17-9" fill="none" stroke="#2a3442" strokeWidth="6" strokeLinecap="round" />
      <path d="M160 176c0 10 7 17 15 19-1-12 0-18 4-28-7 4-13 6-19 9z" fill="#ff7198" stroke="#2a3442" strokeWidth="5" />

      <path d="M101 120c0-17 12-28 27-28 13 0 25 8 30 22" fill="none" stroke="#2a3442" strokeWidth="7" strokeLinecap="round" />
      <path d="M219 120c0-17-12-28-27-28-13 0-25 8-30 22" fill="none" stroke="#2a3442" strokeWidth="7" strokeLinecap="round" />

      <path d="M93 110c15-8 31-12 48-12 16 0 31 4 44 12" fill="none" stroke="#566578" strokeWidth="9" strokeLinecap="round" />
      <circle cx="126" cy="118" r="24" fill="url(#winky-goggle)" stroke="#2a3442" strokeWidth="8" />
      <circle cx="195" cy="118" r="24" fill="url(#winky-goggle)" stroke="#2a3442" strokeWidth="8" />
      <rect x="148" y="111" width="26" height="12" rx="6" fill="#2a3442" />
      <circle cx="128" cy="121" r="7" fill="#2a3442" />
      <circle cx="193" cy="119" r="7" fill="#2a3442" />
      <circle cx="198" cy="114" r="2.6" fill="#ffffff" />

      <path d="M94 210c-15 4-24 17-24 28 0 12 9 22 22 22 17 0 29-12 29-26 0-13-12-26-27-24z" fill="#fff3e2" stroke="#2a3442" strokeWidth="8" />
      <path d="M229 205c12 3 22 12 28 28l10 30" fill="none" stroke="#2a3442" strokeWidth="8" strokeLinecap="round" />
      <path d="M215 203c9 10 16 16 28 18" fill="none" stroke="#2a3442" strokeWidth="8" strokeLinecap="round" />

      <path d="M207 220l26-16c8-5 18-5 24 1 5 5 4 14-2 19l-28 18z" fill="url(#winky-metal)" stroke="#2a3442" strokeWidth="7" />
      <path d="M232 205l18-12c7-5 17-4 22 2 4 5 4 13-2 18l-21 14" fill="url(#winky-metal)" stroke="#2a3442" strokeWidth="7" />
      <path d="M222 239l-17-27 26-17 18 28" fill="url(#winky-metal)" stroke="#2a3442" strokeWidth="7" />

      <path d="M136 256c0 12-8 21-18 21-10 0-18-9-18-21" fill="none" stroke="#2a3442" strokeWidth="8" strokeLinecap="round" />
      <path d="M213 256c0 12-8 21-18 21-10 0-18-9-18-21" fill="none" stroke="#2a3442" strokeWidth="8" strokeLinecap="round" />

      <path d="M146 44c9-10 20-15 33-15 16 0 27 7 36 20" fill="none" stroke="#2a3442" strokeWidth="8" strokeLinecap="round" />
      <circle cx="183" cy="41" r="10" fill="#ffd35d" stroke="#2a3442" strokeWidth="6" />
    </svg>
  );
}
