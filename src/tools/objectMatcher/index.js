import "./styles.css";

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

function clearAppRoot() {
  const root = document.querySelector("#app");
  root.replaceChildren();
  return root;
}

function setToolParam(value) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("tool", value);
  else url.searchParams.delete("tool");
  window.location.href = url.toString();
}

function getFrameMatches(frames, x, y) {
  return frames.filter(
    (frame) =>
      x >= frame.x &&
      y >= frame.y &&
      x < frame.x + frame.width &&
      y < frame.y + frame.height,
  );
}

function formatFrame(frame) {
  return [
    frame.id,
    "",
    `source: ${frame.source}`,
    `kind: ${frame.kind}`,
    `chunk: ${frame.chunk}`,
    `index: ${frame.index}`,
    `palette: ${frame.palette}`,
    `rect: x=${frame.x}, y=${frame.y}, w=${frame.width}, h=${frame.height}`,
  ].join("\n");
}

function updateMarker(marker, frame, scale) {
  marker.hidden = !frame;
  if (!frame) return;

  marker.style.left = `${frame.x * scale}px`;
  marker.style.top = `${frame.y * scale}px`;
  marker.style.width = `${frame.width * scale}px`;
  marker.style.height = `${frame.height * scale}px`;
}

function createHeader() {
  const header = document.createElement("header");
  header.className = "object-matcher__header";

  const title = document.createElement("h1");
  title.className = "object-matcher__title";
  title.textContent = "objects.png matcher";

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "object-matcher__button";
  backButton.textContent = "Back to game";
  backButton.addEventListener("click", () => setToolParam(null));

  header.append(title, backButton);
  return header;
}

export function isObjectMatcherTool() {
  return new URLSearchParams(window.location.search).get("tool") === "object-matcher";
}

export function createObjectMatcherButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool-switch";
  button.textContent = "objects matcher";
  button.addEventListener("click", () => setToolParam("object-matcher"));
  document.body.appendChild(button);
  return button;
}

export async function createObjectMatcherTool() {
  document.body.style.margin = "0";
  document.body.style.background = "#111719";
  document.body.style.overflow = "auto";

  const root = clearAppRoot();
  root.className = "object-matcher";
  root.textContent = "Loading objects matcher...";

  const atlas = await loadJson("/assets/atlases/objects.json");

  const imageWrap = document.createElement("div");
  imageWrap.className = "object-matcher__image-wrap";

  const imageLayer = document.createElement("div");
  imageLayer.className = "object-matcher__image-layer";

  const image = document.createElement("img");
  image.className = "object-matcher__image";
  image.src = "/assets/atlases/objects.png";
  image.alt = "objects.png atlas";
  image.draggable = false;

  const marker = document.createElement("div");
  marker.className = "object-matcher__marker";
  marker.hidden = true;

  imageLayer.append(image, marker);
  imageWrap.append(imageLayer);

  const details = document.createElement("aside");
  details.className = "object-matcher__details";
  details.textContent = "Click a sprite in objects.png.";

  image.addEventListener("load", () => {
    const scale = 2;
    image.style.width = `${image.naturalWidth * scale}px`;
    image.style.height = `${image.naturalHeight * scale}px`;
    imageLayer.style.width = image.style.width;
    imageLayer.style.height = image.style.height;

    image.addEventListener("click", (event) => {
      const rect = image.getBoundingClientRect();
      const x = Math.floor(((event.clientX - rect.left) / rect.width) * image.naturalWidth);
      const y = Math.floor(((event.clientY - rect.top) / rect.height) * image.naturalHeight);
      const matches = getFrameMatches(atlas.frames, x, y);
      const primary = matches[0] || null;

      updateMarker(marker, primary, scale);
      details.textContent = [
        `click: x=${x}, y=${y}`,
        `matches: ${matches.length}`,
        "",
        matches.length ? matches.map(formatFrame).join("\n\n---\n\n") : "No object frame at this point.",
      ].join("\n");
    });
  });

  root.replaceChildren(createHeader(), imageWrap, details);
}
