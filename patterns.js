// Section Templates
export const headerVariants = {
  "header-centered": `
  Transparent header with logo centered above the menu.
  Header must use absolute, top-0, left-0, w-full, z-10 to be placed over Hero section.
  Logo: use class="mx-auto max-w-[250px] max-h-[100px]" inside header container.
  Below the logo: centered navigation inside max-w-[1200px] mx-auto.
  Navigation: use flex justify-center gap-6.
  Nav items:
    - Contained (e.g., px-4 py-2 rounded-full bg-white/10 or similar)
    - Hover effects: background opacity change (hover:bg-opacity-20).
    - If background is dark: text-white.
    - Active link: background with logo's secondary color.
  Use Tailwind for spacing, padding, and full mobile responsiveness.
  `,
  "header-default": `
   Transparent header with logo left, nav right. 
   Logo: use class="max-w-[250px] max-h-[100px]" and same height to prevent oversize.
   Underline active nav item using logo's secondary color.
   Max width: 1200px (use max-w-[1200px] mx-auto).
   If background is dark use text-white and z-10, relative.
  `,
};

export const heroVariants = {
  "hero-centered-overlay": `
  Background image with dark overlay both same size.
  Heading and CTA justify and align centered over image.
  Max height 100vh including header.
  Use bg-fixed and white text over overlay.
  Use padding.
  Center all text with flex flex-col justify-center items-center text-center.
  Text must use text-white z-10 relative.
  All elements inside should have white text color over overlay.
  CTA button must include hover:opacity-90.
  `,

  "hero-left-text-right-img": `
  Split layout: left column text, right image.
  Use responsive flex.
  Text includes headline, subheading, CTA button.
  Image should cover full height on right.
  CTA button must include hover:opacity-90.
  `,

  "hero-text-only": `
  Hero section with text only.
  Center all text with flex flex-col justify-center items-center text-center.
  Use padding. Heading and CTA centered using Tailwind.
  CTA button must include hover:opacity-90.
  `,
};

export const promoSection = `
  Light background. All items Centered using Tailwind.
  Two columns: heading on left, paragraph on right. max-w-[1200px] mx-auto, py-16.
  Message should reflect brand promise or value.`;

export const featuresSection = `
  Flex aligned and justify - center of 4 cards.
  Each card uses Font Awesome icons (or all cards use images).
  Card content includes icon/image, bold title, and short description. 
  Content inside cards center aligned with flex flex-col items-center text-center.
  If using Font Awesome icons on dark background, icons should be white (text-white).
  All cards must use same consistent height.
  Card overflow should be hidden to avoid layout shifts. 
  Wrap inside max-w-[1200px] mx-auto with py-16.
  Use flex layout for mobile responsiveness (flex-col sm:flex-wrap as needed).
`;

export const portfolioSection = `Create a section titled "My Portfolio" centered at the top.
Overall section:
- Wrap everything inside max-w-[1200px] mx-auto
- Add horizontal padding px-4 or px-6
- Add vertical spacing: py-16
- Center-align all card content`;

export const contactSection = `
  White background.
  Center-aligned large serif heading.
  Short description and CTA button.
  All centered using Tailwind.
  Use py-16 and max-w-[1200px].`;

export const footerSection = `
  Muted background (light from logo) full width.
  Left side: copyright.
  Right: social media icons with class text-xl or text-2xl.
  Use white text if background is dark. Add hover effects (hover:opacity-80).
  Use flex justify-between in max-w-[1200px] container.
  Use flex layout for mobile responsiveness (flex-col sm:flex-row as needed).
`;

export const buildPatternPrompt = (config) => {
  const {
    projectName,
    description,
    websiteType,
    logoUrl,
    imageList,
    colors,
    patterns,
    goal,
    sections,
  } = config;

  const sectionTemplates = {
    header: headerVariants[patterns.header],
    hero: heroVariants[patterns.hero],
    promo: promoSection,
    features: featuresSection,
    portfolio: portfolioSection,
    contact: contactSection,
    footer: footerSection,
  };

  const sectionsContent = sections
    .map(
      (section) =>
        `\n<!-- ${
          section.charAt(0).toUpperCase() + section.slice(1)
        } Section -->\n${sectionTemplates[section]}`
    )
    .join("\n");

  return `
  You are a professional HTML landing page developer.
  
  Generate a modern, responsive landing page using Tailwind CSS cdn(<script src="https://cdn.tailwindcss.com"></script>) in <head></head>.
  
  Use inline <style> for defining these custom colors:
  ${colors.map((color, i) => `  - ${color} (color ${i + 1})`).join("\n")}
  
  Define color utilities like: 
    .bg-primary, .text-primary, .text-muted, etc. in <style>, 
    and use them throughout the HTML.
  
  Use Tailwind classes for layout, spacing, and typography.
  Use inline CSS only for background-image and sizes where Tailwind does not support.
  
  ---
  
  Project name: **${projectName}**
  Description: **${description}**
  Website type: **${websiteType}**
  Logo URL: ${logoUrl}
  Goal: ${goal}  
  
  ---
  
  Use these royalty-free image URLs creatively:
  ${imageList.map((url, i) => `Image ${i + 1}: ${url}`).join("\n")}
  
  ---  

  Layout Structure:
  ${sectionsContent}
  `;
};

// Массив доступных вариантов паттернов для каждой секции
const patternOptions = {
  header: Object.keys(headerVariants),
  hero: Object.keys(heroVariants),
  promo: ["promo"], // если у тебя будет несколько вариантов — добавишь сюда
  features: ["features"],
  contact: ["contact"],
  footer: ["footer"],
};

export function autoSelectPatterns(previousPatterns = {}, sections) {
  const nextPatterns = {};

  for (const section of sections) {
    const options = patternOptions[section];
    if (!options) continue; // если секция не найдена в списке — пропускаем

    const current = previousPatterns[section];
    const index = current ? options.indexOf(current) : -1;
    const nextIndex = (index + 1) % options.length;
    nextPatterns[section] = options[nextIndex];
  }

  return nextPatterns;
}
