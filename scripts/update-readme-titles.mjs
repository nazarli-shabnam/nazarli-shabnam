import fs from "node:fs";
import path from "node:path";

const README_PATH = path.join(process.cwd(), "README.md");

function getBadgeTitle(slug) {
  const svgPath = path.join(process.cwd(), "my-badges", `${slug}.svg`);
  if (!fs.existsSync(svgPath)) return null;
  
  const svgContent = fs.readFileSync(svgPath, "utf8");
  const titleMatch = svgContent.match(/<title>([^<]+)<\/title>/);
  return titleMatch ? titleMatch[1] : null;
}

function updateReadmeTitles() {
  let readme = fs.readFileSync(README_PATH, "utf8");
  
  const onFireTitle = getBadgeTitle("on-fire-30");
  if (onFireTitle) {
    readme = readme.replace(
      /(<img[^>]*on-fire-30\.svg[^>]*title=")[^"]*(")/,
      `$1${onFireTitle.replace(/"/g, "&quot;")}$2`
    );
  }
  
  const starsTitle = getBadgeTitle("stars-4");
  if (starsTitle) {
    readme = readme.replace(
      /(<img[^>]*stars-4\.svg[^>]*title=")[^"]*(")/,
      `$1${starsTitle.replace(/"/g, "&quot;")}$2`
    );
  }
  
  const favoriteWordTitle = getBadgeTitle("favorite-word-add");
  if (favoriteWordTitle) {
    const escapedTitle = favoriteWordTitle.replace(/"/g, "&quot;");
    readme = readme.replace(
      /(<img[^>]*favorite-word-add\.svg[^>]*title=')[^']*(')/,
      `$1${escapedTitle}$2`
    );
  }
  
  fs.writeFileSync(README_PATH, readme, "utf8");
  console.log("Updated README title attributes");
}

updateReadmeTitles();
