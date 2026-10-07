# Nebula — 3D Website

An interactive, scroll-driven 3D website built with [Three.js](https://threejs.org/). No build step and no framework: plain HTML, CSS and one JavaScript module.

## Features

- **Shader orb**: an icosphere distorted by simplex noise in a custom GLSL shader. Click it to change its colors.
- **Scroll-driven camera**: each page section has its own 3D object (orb, metallic torus knot, floating cube cluster, crystal), and the camera moves between them as you scroll.
- **Pointer parallax**: the scene tilts with your mouse.
- **Responsive**: on phones the objects move above the text.
- **Reduced motion**: animation slows down when `prefers-reduced-motion` is set.

## Run locally

ES modules need to be served over HTTP, so opening `index.html` directly from disk won't work. From the project folder, run:

```bash
python3 -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000.

## Deploy

Upload the folder to any static host, such as GitHub Pages, Netlify, Vercel or Cloudflare Pages. Three.js is vendored in `vendor/`, so the site doesn't depend on a CDN.

## Structure

```
index.html            page markup and section content
style.css             layout and typography
src/main.js           Three.js scene, objects, scroll and pointer handling
vendor/               three.module.min.js (r160, MIT license)
```
