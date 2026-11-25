// One offline type kit for both HTML and painted canvas lettering.
import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/latin-500.css';
import '@fontsource/alegreya/latin-600.css';
import '@fontsource/alegreya/latin-700.css';
import '@fontsource/alegreya/latin-400-italic.css';
import '@fontsource/im-fell-english-sc/latin-400.css';
import '@fontsource/im-fell-english/latin-400.css';
import '@fontsource/im-fell-english/latin-400-italic.css';
import './codexTheme.css';

export async function loadGameFonts() {
  // World signs and skill trees bake their lettering into canvases. Loading
  // first prevents a fallback font from becoming permanent in those textures.
  await Promise.all([
    document.fonts.load('400 16px Alegreya'),
    document.fonts.load('500 16px Alegreya'),
    document.fonts.load('600 16px Alegreya'),
    document.fonts.load('700 16px Alegreya'),
    document.fonts.load('400 20px "IM Fell English SC"'),
  ]).catch(() => {
    /* The serif fallbacks keep the game playable if a font fails. */
  });
}
