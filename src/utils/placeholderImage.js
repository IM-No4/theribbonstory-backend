const CATEGORY_PALETTES = {
  "photo-magnets": [["#FAF0E6", "#FFF5F5"], ["#FFF5F5", "#F6F2F8"]],
  "polaroid-magnets": [["#FFFDF8", "#FAF0E6"], ["#F6F2F8", "#FFF5F5"]],
  "3d-keepsakes": [["#FFF5F5", "#FAF0E6"], ["#F6F2F8", "#FAF0E6"]],
  "personalized-name-magnets": [["#FAF0E6", "#FFFDF8"], ["#FFF5F5", "#F6F2F8"]],
  "travel-memory-magnets": [["#FFF4EE", "#FFFDF8"], ["#F6F2F8", "#FAF0E6"]],
  "gift-hampers": [["#FAF0E6", "#FFF5F5"], ["#FFF4EE", "#F6F2F8"]],
  "cute-magnets": [["#FFF5F5", "#FAF0E6"], ["#F6F2F8", "#FFFDF8"]],
};
const FALLBACK_PALETTES = [["#FFFDF8", "#FFF5F5"], ["#FAF0E6", "#FFF4EE"]];

const escape = (str = "") =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const placeholderImage = (label, seedIndex = 0, { icon = "magnet", category = "photo-magnets" } = {}) => {
  const palettes = CATEGORY_PALETTES[category] || FALLBACK_PALETTES;
  const [bgStart, bgEnd] = palettes[seedIndex % palettes.length];
  const safeLabel = escape(label);

  let visualGraphic = "";
  if (category === "3d-keepsakes" || label.includes("3D")) {
    visualGraphic = `
      <!-- 3D Base Podium -->
      <ellipse cx="150" cy="220" rx="85" ry="24" fill="#E6B3BA" opacity="0.4"/>
      <ellipse cx="150" cy="216" rx="80" ry="20" fill="#FFFDF8"/>
      <!-- 3D Figurine Silhouette & Glow -->
      <path d="M150 70 C130 70 115 88 115 110 C115 125 124 138 135 145 C122 154 110 170 108 190 L192 190 C190 170 178 154 165 145 C176 138 185 125 185 110 C185 88 170 70 150 70 Z" fill="#722F3D" opacity="0.85"/>
      <circle cx="150" cy="105" r="22" fill="#D68893" opacity="0.9"/>
      <!-- Sparkles -->
      <polygon points="90,80 94,84 90,88 86,84" fill="#E27D60"/>
      <polygon points="210,95 214,99 210,103 206,99" fill="#D68893"/>
    `;
  } else if (category === "polaroid-magnets" || label.includes("Polaroid")) {
    visualGraphic = `
      <!-- Polaroid Frame -->
      <rect x="55" y="45" width="190" height="210" rx="8" fill="#FFFFFF" stroke="#EFEBE8" stroke-width="2" filter="drop-shadow(0 10px 15px rgba(74,31,41,0.1))"/>
      <rect x="70" y="60" width="160" height="135" fill="#FAF0E6"/>
      <!-- Photo Silhouette -->
      <circle cx="150" cy="115" r="32" fill="#D68893" opacity="0.6"/>
      <path d="M110 170 Q150 135 190 170 Z" fill="#722F3D" opacity="0.7"/>
      <!-- Polaroid Handwritten Note -->
      <text x="150" y="228" font-family="'Sacramento', cursive" font-size="19" fill="#4A1F29" text-anchor="middle">Forever &amp; Always</text>
    `;
  } else if (category === "travel-memory-magnets" || label.includes("Travel")) {
    visualGraphic = `
      <!-- Stamp / Travel Magnet Frame -->
      <rect x="50" y="50" width="200" height="190" rx="16" fill="#FFFFFF" stroke="#D68893" stroke-width="3" stroke-dasharray="8 6"/>
      <path d="M65 170 Q110 120 150 155 T235 160 L235 220 L65 220 Z" fill="#E27D60" opacity="0.5"/>
      <circle cx="180" cy="90" r="18" fill="#F08A71" opacity="0.7"/>
      <path d="M90 120 C90 100 120 90 150 90 C180 90 210 100 210 120 Z" fill="#722F3D" opacity="0.3"/>
      <text x="150" y="210" font-family="'Playfair Display', serif" font-size="13" font-weight="600" fill="#4A1F29" text-anchor="middle" letter-spacing="2">PASSPORT MOMENT</text>
    `;
  } else if (category === "gift-hampers" || label.includes("Hamper")) {
    visualGraphic = `
      <!-- Ribbon Gift Box -->
      <rect x="65" y="95" width="170" height="135" rx="12" fill="#FAF0E6" stroke="#D68893" stroke-width="2"/>
      <rect x="60" y="80" width="180" height="30" rx="6" fill="#722F3D"/>
      <!-- Vertical & Horizontal Ribbon -->
      <rect x="140" y="80" width="20" height="150" fill="#A83F52"/>
      <path d="M150 80 C130 50 100 65 130 80 Z" fill="#D68893"/>
      <path d="M150 80 C170 50 200 65 170 80 Z" fill="#D68893"/>
      <circle cx="150" cy="80" r="7" fill="#722F3D"/>
    `;
  } else {
    visualGraphic = `
      <!-- Classic Photo Magnet Acrylic Frame -->
      <rect x="50" y="50" width="200" height="200" rx="20" fill="#FFFFFF" stroke="#E6B3BA" stroke-width="2"/>
      <rect x="65" y="65" width="170" height="170" rx="14" fill="#FAF0E6"/>
      <circle cx="150" cy="130" r="40" fill="#D68893" opacity="0.5"/>
      <path d="M100 200 C100 170 130 155 150 155 C170 155 200 170 200 200 Z" fill="#722F3D" opacity="0.6"/>
      <!-- Glossy Reflection -->
      <path d="M65 65 L140 65 L65 140 Z" fill="#FFFFFF" opacity="0.35"/>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgStart}"/>
        <stop offset="100%" stop-color="${bgEnd}"/>
      </linearGradient>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.2" fill="#722F3D" opacity="0.05"/>
      </pattern>
    </defs>
    <rect width="300" height="300" rx="16" fill="url(#bgGrad)"/>
    <rect width="300" height="300" rx="16" fill="url(#grid)"/>
    
    ${visualGraphic}

    <!-- Brand Tag Badge -->
    <rect x="75" y="16" width="150" height="22" rx="11" fill="#FFFDF8" opacity="0.95" stroke="#E6B3BA" stroke-width="1"/>
    <text x="150" y="31" font-family="'Jost', sans-serif" font-size="9" font-weight="600" fill="#722F3D" text-anchor="middle" letter-spacing="1.5">THE RIBBON STORY</text>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};

