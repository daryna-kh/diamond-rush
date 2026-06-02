import "./styles.css";

const ATLAS_DIR = "/assets/atlases";
const ATLAS_JSON_MODULES = import.meta.glob("../../../public/assets/atlases/*.json", {
  eager: true,
});
const DEFAULT_ATLAS = "objects";
const IMAGE_SCALE = 2;

function atlasIdFromPath(path) {
  return path.split("/").pop().replace(/\.json$/, "");
}

const ATLAS_DATA_BY_ID = new Map(
  Object.entries(ATLAS_JSON_MODULES)
    .map(([path, module]) => [atlasIdFromPath(path), module.default ?? module])
    .sort(([left], [right]) => left.localeCompare(right)),
);
const ATLAS_OPTIONS = Array.from(ATLAS_DATA_BY_ID.keys()).map((id) => ({ id, label: id }));

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

function getAtlasParam() {
  const atlas = new URLSearchParams(window.location.search).get("atlas");
  return ATLAS_OPTIONS.some((candidate) => candidate.id === atlas) ? atlas : DEFAULT_ATLAS;
}

function setAtlasParam(value) {
  const url = new URL(window.location.href);
  url.searchParams.set("tool", "object-matcher");
  url.searchParams.set("atlas", value);
  window.history.replaceState({}, "", url);
}

function atlasImageUrl(atlasId) {
  return `${ATLAS_DIR}/${atlasId}.png`;
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
  title.textContent = "atlas matcher";

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "object-matcher__button";
  backButton.textContent = "Back to game";
  backButton.addEventListener("click", () => setToolParam(null));

  header.append(title, backButton);
  return header;
}

function createAtlasPicker(initialAtlasId, onChange) {
  const field = document.createElement("label");
  field.className = "object-matcher__field";

  const label = document.createElement("span");
  label.textContent = "Atlas";

  const select = document.createElement("select");
  select.className = "object-matcher__select";
  for (const atlas of ATLAS_OPTIONS) {
    const option = document.createElement("option");
    option.value = atlas.id;
    option.textContent = atlas.label;
    select.appendChild(option);
  }
  select.value = initialAtlasId;
  select.addEventListener("change", () => onChange(select.value));

  field.append(label, select);
  return field;
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

  let atlas = null;
  let currentAtlasId = getAtlasParam();

  const imageWrap = document.createElement("div");
  imageWrap.className = "object-matcher__image-wrap";

  const imageLayer = document.createElement("div");
  imageLayer.className = "object-matcher__image-layer";

  const image = document.createElement("img");
  image.className = "object-matcher__image";
  image.alt = "Selected atlas";
  image.draggable = false;

  const marker = document.createElement("div");
  marker.className = "object-matcher__marker";
  marker.hidden = true;

  imageLayer.append(image, marker);
  imageWrap.append(imageLayer);

  const details = document.createElement("aside");
  details.className = "object-matcher__details";
  details.textContent = "Loading atlas...";

  const updateImageSize = () => {
    image.style.width = `${image.naturalWidth * IMAGE_SCALE}px`;
    image.style.height = `${image.naturalHeight * IMAGE_SCALE}px`;
    imageLayer.style.width = image.style.width;
    imageLayer.style.height = image.style.height;
  };

  const loadAtlas = async (atlasId) => {
    currentAtlasId = atlasId;
    setAtlasParam(atlasId);
    marker.hidden = true;
    details.textContent = `Loading ${atlasId}...`;
    atlas = ATLAS_DATA_BY_ID.get(atlasId);
    if (!atlas) throw new Error(`Unknown atlas: ${atlasId}`);
    image.src = atlasImageUrl(atlasId);
    image.alt = `${atlasId}.png atlas`;
    details.textContent = [
      `${atlasId}.png`,
      `${atlasId}.json`,
      `size: ${atlas.width} x ${atlas.height}`,
      `frames: ${atlas.frames.length}`,
      "",
      "Click a sprite in the atlas.",
    ].join("\n");
  };

  image.addEventListener("load", updateImageSize);

  image.addEventListener("click", (event) => {
    if (!atlas) return;

    const rect = image.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * image.naturalWidth);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * image.naturalHeight);
    const matches = getFrameMatches(atlas.frames, x, y);
    const primary = matches[0] || null;

    updateMarker(marker, primary, IMAGE_SCALE);
    details.textContent = [
      `${currentAtlasId}.png`,
      `${currentAtlasId}.json`,
      `click: x=${x}, y=${y}`,
      `matches: ${matches.length}`,
      "",
      matches.length ? matches.map(formatFrame).join("\n\n---\n\n") : "No atlas frame at this point.",
    ].join("\n");
  });

  const header = createHeader();
  header.insertBefore(
    createAtlasPicker(currentAtlasId, (atlasId) => {
      loadAtlas(atlasId).catch((error) => {
        details.textContent = error instanceof Error ? error.message : String(error);
        console.error(error);
      });
    }),
    header.lastChild,
  );

  root.replaceChildren(header, imageWrap, details);
  await loadAtlas(currentAtlasId);
}
