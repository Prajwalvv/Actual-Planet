# Rylvo React Three Fiber Homepage

## Features

- **3D Swarm Particle System**: 1500+ animated particles simulating swarm intelligence
- **Floating Distorted Sphere**: Dynamic morphing geometry with distortion effects
- **Orbiting Rings**: Animated orbital rings around the central sphere
- **Auto-rotating Camera**: Smooth camera movement with orbit controls
- **Responsive Design**: Works on all screen sizes

## Installation

```bash
cd public/site
npm install
```

## Development

```bash
npm run dev
```

This will start the Vite dev server at http://localhost:3000

## Build

```bash
npm run build
```

This creates an optimized production build in the `dist` folder.

## Preview Production Build

```bash
npm run preview
```

## 3D Animation Details

### Swarm Particles
- 1500 particles moving in complex mathematical patterns
- Each particle follows its own trajectory based on sine/cosine functions
- Creates organic, flowing swarm-like movement

### Floating Sphere
- Uses MeshDistortMaterial for dynamic distortion
- Continuously morphs and floats
- Central focal point of the scene

### Orbiting Rings
- Three concentric rings rotating around the sphere
- Creates depth and visual interest
- Subtle transparency for layered effect

## Tech Stack

- React 18
- Three.js
- React Three Fiber
- React Three Drei (helpers)
- Vite (build tool)

## File Structure

```
site/
├── src/
│   ├── App.jsx          # Main React component with 3D scene
│   └── index.jsx        # React entry point
├── index-react.html     # HTML entry point
├── style.css            # Global styles
├── package.json         # Dependencies
└── vite.config.js       # Vite configuration
```
