# Interactive-exhibit reference research — batch w3-cloud-20260928-a

Owner request, 2026-09-29, after rejecting img-05: *"I feel like this much graphic rendition would be intense. Research more references regarding interactive exhibits, think more abstract like: Refik Anadol, Ryoichi Kurokawa, and Miguel Chevalier's work. Moreso on Refik's."*

Method: creator and institution pages retrieved with `curl` in the Cloud session (WebFetch was egress-blocked for these hosts). Images were viewed as downscaled contact sheets in the private scratch area only; none are committed or used as runtime assets. Artist sites describe their own work; these are project descriptions, not measured effects. Video was not watched.

## Refik Anadol (primary)

| Work / source | What the source says | What was observed in official images |
| --- | --- | --- |
| [Melting Memories](https://refikanadol.com/works/melting-memories/) (2018, creator site) | EEG data on cognitive control, transposed "into procedural noise forms" in real time; "data paintings, augmented data sculptures and light projections". | A 6 m monochrome LED relief: grey-white terrain-like displacement surface, deep folds, lit as if physical. |
| [Inner Portrait](https://refikanadol.com/works/inner-portrait/) (creator site) | Heart rate, skin conductance and EEG of travellers turned into "AI Data Paintings" of "unseen emotional journeys", with "vivid pigments, shapes, and patterns" for a "meditative and multisensory experience". | Bilaterally mirrored, room-scale pigment masses; coarse granular particle texture with depth; saturated orange/cobalt against black folds. |
| [Sense of Healing](https://refikanadol.com/works/sense-of-healing-ai-data-sculpture/) (creator site) | "meditative art based on neurological data" (EEG, fMRI, DTI). | Swirling turquoise fluid pigment; dense red granular eddies. |
| [Machine Hallucinations — Nature Dreams](https://refikanadol.com/works/machine-hallucinations-nature-dreams/) (creator site) | GAN "inspired by fluid dynamics"; "dynamic pigments". | Process slides: particle-dust overlays on black. |
| [Quantum Memories](https://refikanadol.com/works/quantummemories/) (creator site) | Tracks "the audience's movements in real-time" so observer position is "entangled with the visible outcomes". | Not viewed. |
| [Unsupervised, MoMA](https://www.moma.org/calendar/exhibitions/5535) (institution; via search result, page 403 to curl) | Model "walks" through a latent space; Gund Lobby light, movement, acoustics and weather "affect the continuously shifting imagery and sound". | Not viewed. |

## Ryoichi Kurokawa

| Work / source | Observation |
| --- | --- |
| [Rheo](https://www.ryoichikurokawa.com/project/rheo.html) (2009, creator site) | Stills: white filament point-cloud structures on black; a city image dissolving into vertical time-smear streaks. |
| [subassemblies](https://www.ryoichikurokawa.com/project/sa.html) (2019, creator site) | Scanned forest and architecture rendered as dense point clouds that decompose; audiovisual concert with strobe (a mode EVA must not copy). |

## Miguel Chevalier

The creator site is a JavaScript app that curl cannot read, so these are press sources, not creator statements.

| Work / source | Observation |
| --- | --- |
| Magic Carpets (2014–), [designboom](https://www.designboom.com/art/miguel-chevalier-magic-carpet-milton-keynes-virtual-reality-installation-07-22-2016/) | Continuous generative floor patterns whose topography ripples and eddies locally around each visitor's position; described as drawing on cellular automata and microorganisms. |
| Extra-Natural (2018), via search summary | Virtual plants that sway and bloom generatively. |

## Translation into EVA (proposal, not accepted)

1. **Dither becomes particles, not pixels.** Each dither dot of the Week 1 eye is a particle with depth. At rest the particles settle into the eye's density: red, square pupil, cursor gaze. While speaking they release into a fluid flow and condense into an emotional pigment formation, then flow back. (Anadol: pigment particles, fluid dynamics; answers "dithering should not be a translation for 2D pixels".)
2. **Continuous latent walk.** Forms morph continuously and never replay a clip. Turn state, cursor and speech amplitude modulate the flow, as Unsupervised's environment inputs do. No claim of measuring emotion: stances remain authored responses.
3. **Relief and depth, softly.** Forms read as meditative, atmospheric pigment clouds or displaced relief, not hard-edged graphic volumes (owner: graphic renditions "would be intense").
4. **Processing = decomposition.** The eye thins into a filament point cloud with horizontal time-smears (Kurokawa), keeping the GIF-derived RGB smear only as colour separation within the particle trails. No strobe.
5. **Cursor = local eddy.** Pointer presence locally displaces the particle field, as Chevalier's floors respond to visitors, while the eye's gaze follows at rest.
6. **Tracking boxes** stay a sparse annotation layer that follows particle-cluster centroids.

Implementation note: Canvas2D point splatting into an `ImageData` buffer allows tens of thousands of particles on CPU, within the GPU-quarantine rule. Exact particle budget to be measured, not assumed.
