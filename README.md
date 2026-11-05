# Gestures to Shape

Ten thousand particles that Galaxy into a flower or coil into a glowing knot,
shaped by your hands through the webcam.

| Gesture     | Shape | What you see                                              |
|-------------|-------|-----------------------------------------------------------|
| Open palm   | Galaxy | A five-petal flower with inner petal rings, filling the screen |
| Closed fist | KNOT  | A glowing trefoil knot, colour running ember → ice        |

Move your hand left or right to turn the shape, and up or down to lift it.

## Run it

No build step is needed. Webcam access requires `http://localhost` or HTTPS,
so serve the folder rather than opening the file directly:


cd gesture-particles
python3 -m http.server 8080
# open http://localhost:8080 in Chrome, Edge, Firefox or Safari


Allow camera access when prompted. If you decline, use "Use mouse or touch
instead": drag to turn the shape and tap to switch between Galaxy and KNOT.

Libraries load from CDNs (see the import map in `index.html`):

- `three@0.160.0` for rendering
- `@mediapipe/tasks-vision@0.10.14` for hand landmarks

## Files


gesture-particles/
├── index.html        Page layout, overlays, status panel, import map
├── css/
│   └── style.css     Theme, panels, animations, responsive rules
├── js/
│   ├── main.js       App wiring: scene, lifecycle, gestures, controls, render loop
│   ├── particles.js  ParticleField: one THREE.Points, eased transitions, shader
│   ├── shapes.js     Builders for the Galaxy flower and the KNOT
│   ├── palette.js    Particle count and the ember → ice colour ramp
│   ├── hands.js      Webcam, MediaPipe HandLandmarker, gesture classification
│   └── ui.js         DOM: overlays, status panel, chips, notices, info text
└── README.md


## Notes

- Points are drawn without blur. The shader gives each particle a crisp,
  soft-edged dot about 4–12px across.
- Hand tracking runs at up to 30 detections per second. It is skipped when
  the video frame hasn't changed.
- Camera video is processed locally and never uploaded.
