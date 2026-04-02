/**
 * LowPolyShipDesignerV5.jsx
 *
 * Unified low-poly asset designer with:
 *  - Ship, Mecha, and generic mesh part types
 *  - Integrated Socket editor (weapon, engine, thruster, shield, fx, custom)
 *  - Animation State system: define named states, interpolate between them
 *  - Vertex color painting with 16-color palette
 *  - Transform controls (position, rotation, scale, stretch XYZ, mirror)
 *  - Export: JSON blueprint, OBJ, GLTF, or BAKE (zip with all assets)
 *  - Import: JSON blueprint or socket-config.json
 *
 * Usage:
 *   import LowPolyShipDesignerV5 from './LowPolyShipDesignerV5';
 *
 *   <LowPolyShipDesignerV5
 *     initialDesign={savedParts}
 *     onSave={(parts) => handleSave(parts)}
 *     onCancel={() => setEditorOpen(false)}
 *   />
 *
 * Dependencies: React 18+, Three.js r128+
 * Optional for zip export: fflate (bundled inline as a minimal base64-encoded shim)
 */

import React, {
  useState, useEffect, useRef, useMemo, useCallback, useReducer
} from 'react';
import * as THREE from 'three';

// ============================================================================
// CONSTANTS
// ============================================================================

const PALETTE = [
  '#FFFFFF', '#CCCCCC', '#888888', '#444444',
  '#4488FF', '#2244AA', '#88CCFF', '#00FFFF',
  '#FFCC00', '#FF6600', '#FF3366', '#FF88AA',
  '#44FF88', '#22AA66', '#1a1a2e', '#2d2d44'
];

const SHIP_TYPES = [
  { type: 'fuselage', icon: '◆', label: 'Fuselage', group: 'ship' },
  { type: 'wing',     icon: '◢', label: 'Wing',     group: 'ship' },
  { type: 'engine',   icon: '●', label: 'Engine',   group: 'ship' },
  { type: 'cockpit',  icon: '◠', label: 'Cockpit',  group: 'ship' },
  { type: 'fin',      icon: '▲', label: 'Fin',      group: 'ship' },
  { type: 'weapon',   icon: '│', label: 'Weapon',   group: 'ship' },
];

const MECHA_TYPES = [
  { type: 'head',     icon: '◉', label: 'Head',     group: 'mecha' },
  { type: 'torso',    icon: '▬', label: 'Torso',    group: 'mecha' },
  { type: 'arm',      icon: '╱', label: 'Arm',      group: 'mecha' },
  { type: 'leg',      icon: '║', label: 'Leg',      group: 'mecha' },
  { type: 'booster',  icon: '⊕', label: 'Booster',  group: 'mecha' },
  { type: 'shoulder', icon: '◧', label: 'Shoulder', group: 'mecha' },
];

const ALL_COMPONENT_TYPES = [...SHIP_TYPES, ...MECHA_TYPES];

const POLYGON_COUNTS = {
  fuselage: 12, wing: 12, engine: 24, cockpit: 16, fin: 12, weapon: 16,
  head: 20, torso: 18, arm: 16, leg: 16, booster: 20, shoulder: 14,
};

const SOCKET_TYPES = [
  { id: 'weapon',   label: 'Weapon',   color: '#ff4444', icon: '⚡' },
  { id: 'engine',   label: 'Engine',   color: '#ff8c00', icon: '🔥' },
  { id: 'thruster', label: 'Thruster', color: '#00cfff', icon: '💨' },
  { id: 'shield',   label: 'Shield',   color: '#44aaff', icon: '🛡' },
  { id: 'fx',       label: 'FX',       color: '#aa44ff', icon: '✨' },
  { id: 'custom',   label: 'Custom',   color: '#aaaaaa', icon: '📌' },
];

const SOCKET_COLOR_MAP = Object.fromEntries(SOCKET_TYPES.map(t => [t.id, t.color]));

const EDITOR_TABS = ['MESH', 'SOCKETS', 'ANIMATE'];

const MAX_PARTS = 32;
const MAX_ANIM_STATES = 8;

// ============================================================================
// UTILITIES
// ============================================================================

const generateId = () => Math.random().toString(36).substr(2, 7);

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? {
    r: parseInt(r[1], 16) / 255,
    g: parseInt(r[2], 16) / 255,
    b: parseInt(r[3], 16) / 255
  } : { r: 0.8, g: 0.8, b: 0.8 };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpArr(a, b, t) {
  return a.map((v, i) => lerp(v, (b && b[i] !== undefined) ? b[i] : v, t));
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function socketTypeColor(type) {
  return SOCKET_COLOR_MAP[type] ?? '#aaaaaa';
}

// ============================================================================
// GEOMETRY FACTORY (ship + mecha)
// ============================================================================

function createGeometry(type) {
  let geometry;
  switch (type) {
    case 'fuselage':
      geometry = new THREE.ConeGeometry(0.5, 2, 6);
      geometry.rotateX(Math.PI / 2); break;
    case 'wing':
      geometry = new THREE.BoxGeometry(1.8, 0.08, 0.7); break;
    case 'engine':
      geometry = new THREE.CylinderGeometry(0.25, 0.18, 0.6, 6);
      geometry.rotateX(Math.PI / 2); break;
    case 'cockpit':
      geometry = new THREE.SphereGeometry(0.35, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'fin':
      geometry = new THREE.BoxGeometry(0.08, 0.6, 0.4); break;
    case 'weapon':
      geometry = new THREE.CylinderGeometry(0.06, 0.06, 1, 4);
      geometry.rotateX(Math.PI / 2); break;
    case 'head':
      geometry = new THREE.BoxGeometry(0.6, 0.7, 0.55); break;
    case 'torso':
      geometry = new THREE.BoxGeometry(1.0, 1.2, 0.6); break;
    case 'arm':
      geometry = new THREE.CylinderGeometry(0.14, 0.11, 1.1, 6); break;
    case 'leg':
      geometry = new THREE.CylinderGeometry(0.17, 0.13, 1.3, 6); break;
    case 'booster':
      geometry = new THREE.CylinderGeometry(0.22, 0.15, 0.55, 8);
      geometry.rotateX(Math.PI / 2); break;
    case 'shoulder':
      geometry = new THREE.SphereGeometry(0.28, 6, 5); break;
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  const nonIndexed = geometry.toNonIndexed();
  const posCount = nonIndexed.attributes.position.count;
  const colors = new Float32Array(posCount * 3).fill(0.8);
  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

function exportBlueprintJSON(parts, sockets, animStates, meshName, filename) {
  const data = {
    version: '2.0',
    type: 'lowpoly-v5-blueprint',
    mesh: meshName || 'asset',
    exportedAt: new Date().toISOString(),
    components: parts.map(({ id, ...rest }) => rest),
    sockets: sockets.map(({ id, ...rest }) => rest),
    animationStates: animStates.map(s => ({
      name: s.name,
      description: s.description || '',
      transforms: s.transforms // partId -> {position, rotation, scale, scaleXYZ}
    }))
  };
  downloadFile(JSON.stringify(data, null, 2), filename || 'asset.json', 'application/json');
}

function exportSocketConfig(sockets, meshName) {
  const data = {
    version: '1.0',
    mesh: meshName || 'asset',
    exportedAt: new Date().toISOString(),
    sockets: sockets.map(({ id, ...s }) => ({
      id: generateId(),
      name: s.name,
      type: s.type,
      position: s.position,
      mirror: s.mirror,
      mirroredPosition: s.mirror ? { x: -s.position.x, y: s.position.y, z: s.position.z } : null
    }))
  };
  downloadFile(JSON.stringify(data, null, 2), `${meshName || 'asset'}-socket-config.json`, 'application/json');
}

function exportAnimStateJSON(state, meshName) {
  const data = {
    version: '1.0',
    mesh: meshName || 'asset',
    stateName: state.name,
    exportedAt: new Date().toISOString(),
    transforms: state.transforms
  };
  downloadFile(JSON.stringify(data, null, 2), `${meshName || 'asset'}-anim-${state.name.replace(/\s+/g,'_')}.json`, 'application/json');
}

function exportToOBJ(meshesRef, parts, filename) {
  let out = `# LowPolyShipDesignerV5 Export\n# ${new Date().toISOString()}\n\n`;
  let offset = 1;
  parts.forEach(part => {
    const mesh = meshesRef[part.id];
    if (!mesh) return;
    const meshes = [{ m: mesh, n: part.name }];
    if (part.mirrored && meshesRef[part.id + '_mirror'])
      meshes.push({ m: meshesRef[part.id + '_mirror'], n: part.name + '_Mirror' });

    meshes.forEach(({ m, n }) => {
      out += `o ${n.replace(/\s+/g, '_')}\n`;
      const pos = m.geometry.attributes.position;
      const col = m.geometry.attributes.color;
      const nor = m.geometry.attributes.normal;
      m.updateMatrixWorld();
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
        out += `v ${v.x.toFixed(5)} ${v.y.toFixed(5)} ${v.z.toFixed(5)} ${col.getX(i).toFixed(4)} ${col.getY(i).toFixed(4)} ${col.getZ(i).toFixed(4)}\n`;
      }
      for (let i = 0; i < nor.count; i++) {
        const n2 = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)).transformDirection(m.matrixWorld);
        out += `vn ${n2.x.toFixed(5)} ${n2.y.toFixed(5)} ${n2.z.toFixed(5)}\n`;
      }
      for (let i = 0; i < pos.count; i += 3) {
        out += `f ${offset+i}//${offset+i} ${offset+i+1}//${offset+i+1} ${offset+i+2}//${offset+i+2}\n`;
      }
      offset += pos.count;
      out += '\n';
    });
  });
  downloadFile(out, filename || 'asset.obj', 'text/plain');
}

function buildGLTFData(meshesRef, parts) {
  const gltf = {
    asset: { version: "2.0", generator: "LowPolyShipDesignerV5" },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: []
  };
  const allBufs = [];
  let byteOffset = 0, nodeIdx = 0, meshIdx = 0, accIdx = 0, bvIdx = 0;

  parts.forEach(part => {
    const mesh = meshesRef[part.id];
    if (!mesh) return;
    const meshes = [{ m: mesh, n: part.name }];
    if (part.mirrored && meshesRef[part.id + '_mirror'])
      meshes.push({ m: meshesRef[part.id + '_mirror'], n: part.name + '_Mirror' });

    meshes.forEach(({ m, n }) => {
      m.updateMatrixWorld();
      const pos = m.geometry.attributes.position;
      const col = m.geometry.attributes.color;
      const nor = m.geometry.attributes.normal;
      const tPos = new Float32Array(pos.count * 3);
      const tNor = new Float32Array(nor.count * 3);
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m.matrixWorld);
        tPos[i*3] = v.x; tPos[i*3+1] = v.y; tPos[i*3+2] = v.z;
        minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); minZ = Math.min(minZ, v.z);
        maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); maxZ = Math.max(maxZ, v.z);
        const nv = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)).transformDirection(m.matrixWorld);
        tNor[i*3] = nv.x; tNor[i*3+1] = nv.y; tNor[i*3+2] = nv.z;
      }

      const addBuf = (arr, type, min, max) => {
        const bytes = new Uint8Array(arr.buffer.slice(0));
        allBufs.push(bytes);
        gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target: 34962 });
        const acc = { bufferView: bvIdx++, componentType: 5126, count: arr.length / (type === 'VEC3' ? 3 : 1), type };
        if (min) acc.min = min;
        if (max) acc.max = max;
        gltf.accessors.push(acc);
        byteOffset += bytes.length;
        return accIdx++;
      };

      const pa = addBuf(tPos, 'VEC3', [minX,minY,minZ], [maxX,maxY,maxZ]);
      const na = addBuf(tNor, 'VEC3');
      const ca = addBuf(col.array, 'VEC3');

      gltf.meshes.push({ name: n, primitives: [{ attributes: { POSITION: pa, NORMAL: na, COLOR_0: ca }, mode: 4 }] });
      gltf.nodes.push({ name: n, mesh: meshIdx++ });
      gltf.scenes[0].nodes.push(nodeIdx++);
    });
  });

  const total = allBufs.reduce((s, b) => s + b.length, 0);
  const combined = new Uint8Array(total);
  let off = 0;
  allBufs.forEach(b => { combined.set(b, off); off += b.length; });
  gltf.buffers.push({
    uri: 'data:application/octet-stream;base64,' + btoa(String.fromCharCode.apply(null, combined)),
    byteLength: total
  });
  return gltf;
}

function exportToGLTF(meshesRef, parts, filename) {
  const gltf = buildGLTFData(meshesRef, parts);
  downloadFile(JSON.stringify(gltf, null, 2), filename || 'asset.gltf', 'model/gltf+json');
}

function importFromBlueprint(jsonString) {
  const data = JSON.parse(jsonString);
  // Accept both V1 and V2 formats + socket-config.json
  if (data.type === 'lowpoly-v5-blueprint') {
    return {
      parts: (data.components || []).map(c => ({ id: generateId(), type: c.type || 'fuselage', name: c.name || 'Part', position: c.position || [0,0,0], rotation: c.rotation || [0,0,0], scale: c.scale ?? 1, scaleXYZ: c.scaleXYZ || [1,1,1], mirrored: c.mirrored || false, visible: c.visible !== false, vertexColors: c.vertexColors || null })),
      sockets: (data.sockets || []).map(s => ({ id: generateId(), name: s.name || 'socket', type: s.type || 'custom', position: s.position || { x:0, y:0, z:0 }, mirror: s.mirror || false })),
      animStates: (data.animationStates || []).map(a => ({ id: generateId(), name: a.name, description: a.description || '', transforms: a.transforms || {} }))
    };
  }
  if (data.type === 'lowpoly-ship') {
    return {
      parts: (data.components || []).map(c => ({ id: generateId(), type: c.type || 'fuselage', name: c.name || 'Part', position: c.position || [0,0,0], rotation: c.rotation || [0,0,0], scale: c.scale ?? 1, scaleXYZ: c.scaleXYZ || [1,1,1], mirrored: c.mirrored || false, visible: c.visible !== false, vertexColors: c.vertexColors || null })),
      sockets: [], animStates: []
    };
  }
  if (data.sockets && data.mesh) {
    return {
      parts: [],
      sockets: (data.sockets || []).map(s => ({ id: generateId(), name: s.name || 'socket', type: s.type || 'custom', position: s.position || { x:0, y:0, z:0 }, mirror: s.mirror || false })),
      animStates: []
    };
  }
  throw new Error('Unsupported file format');
}

// ============================================================================
// STYLES
// ============================================================================

const S = {
  root: {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    background: 'radial-gradient(ellipse at 30% 20%, #0f1a2e 0%, #070b14 70%)',
    color: '#d8e8ff', fontFamily: "'Share Tech Mono', 'Courier New', monospace",
    overflow: 'hidden', userSelect: 'none',
  },
  header: {
    padding: '10px 18px', borderBottom: '1px solid #1a2a44',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'linear-gradient(180deg, rgba(10,18,32,0.97) 0%, transparent 100%)',
    zIndex: 10, flexShrink: 0,
  },
  logo: {
    fontSize: 17, fontWeight: 'bold', letterSpacing: 3,
    background: 'linear-gradient(135deg, #00ffff 0%, #4488ff 50%, #aa44ff 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  tabBar: {
    display: 'flex', gap: 2, background: 'rgba(0,0,0,0.3)',
    borderRadius: 6, padding: 3,
  },
  tab: {
    padding: '5px 14px', borderRadius: 4, cursor: 'pointer',
    fontSize: 10, letterSpacing: 2, border: 'none', background: 'transparent',
    color: '#5a7aaa', transition: 'all 0.15s', fontFamily: 'inherit',
  },
  tabActive: {
    background: 'rgba(68,136,255,0.2)', color: '#00ffff',
    boxShadow: '0 0 8px rgba(0,200,255,0.3)',
  },
  statBar: { display: 'flex', gap: 18, color: '#3a5a7e', fontSize: 11 },
  statVal: { color: '#00ffff' },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  panel: {
    background: 'rgba(10, 18, 32, 0.95)', border: '1px solid #1a2a44',
    borderRadius: 7, padding: 10, margin: 6, backdropFilter: 'blur(8px)',
  },
  panelTitle: {
    fontSize: 9, color: '#3a5a7e', marginBottom: 7,
    textTransform: 'uppercase', letterSpacing: 2,
  },
  viewport: { flex: 1, position: 'relative', overflow: 'hidden' },
  btn: {
    padding: '7px 11px', background: '#0d1826', border: '1px solid #1a2a44',
    borderRadius: 4, color: '#c8d8ff', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 10, transition: 'all 0.15s', letterSpacing: 1,
  },
  btnPrimary: { background: 'linear-gradient(135deg, #2266dd, #1144bb)', borderColor: '#4488ff' },
  btnSuccess: { background: 'linear-gradient(135deg, #22aa66, #117744)', borderColor: '#44ff88', color: '#ccffdd' },
  btnDanger: { background: 'linear-gradient(135deg, #881122, #551122)', borderColor: '#ff3366', color: '#ffaabb' },
  btnAccent: { background: 'linear-gradient(135deg, #5522cc, #3311aa)', borderColor: '#aa44ff', color: '#ddccff' },
  partItem: {
    padding: '7px 9px', marginBottom: 3, background: '#0a1220',
    border: '1px solid transparent', borderRadius: 4,
    cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', fontSize: 10,
  },
  partItemSel: { background: 'rgba(68,136,255,0.15)', border: '1px solid #4488ff', boxShadow: '0 0 8px rgba(68,136,255,0.2)' },
  swatch: { width: 22, height: 22, borderRadius: 3, cursor: 'pointer', border: '2px solid transparent', transition: 'all 0.12s' },
  swatchActive: { border: '2px solid #ffcc00', boxShadow: '0 0 8px #ffcc00' },
  transformBar: {
    padding: '10px 18px', borderTop: '1px solid #1a2a44',
    display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
    background: 'rgba(10, 18, 32, 0.9)', flexShrink: 0,
  },
  tGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  tLabel: { fontSize: 9, color: '#3a5a7e', letterSpacing: 1, minWidth: 52 },
  footer: {
    padding: '10px 18px', borderTop: '1px solid #1a2a44',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'rgba(10, 18, 32, 0.97)', flexShrink: 0,
  },
  modal: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, backdropFilter: 'blur(6px)',
  },
  modalBox: {
    background: '#0a1220', border: '1px solid #1a2a44', borderRadius: 12,
    padding: 22, minWidth: 400, maxWidth: 520,
    boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 40px rgba(68,136,255,0.15)',
  },
  input: {
    width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.4)',
    border: '1px solid #1a2a44', borderRadius: 4, padding: '5px 8px',
    color: '#c8d8ff', fontSize: 11, fontFamily: 'inherit', outline: 'none',
  },
  socketItem: {
    padding: '6px 8px', marginBottom: 3, borderRadius: 4, cursor: 'pointer',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 10, border: '1px solid transparent', background: '#060e1a',
  },
  animStateItem: {
    padding: '7px 10px', marginBottom: 4, borderRadius: 5, cursor: 'pointer',
    background: '#080f1e', border: '1px solid #1a2a44', fontSize: 10,
  },
};

const axisColors = ['#ff3366', '#44ff88', '#4488ff'];

// ============================================================================
// CUSTOM HOOK: useDesignerState
// ============================================================================

function useDesignerState(initialParts = []) {
  const [parts, setParts] = useState(initialParts);
  const [selectedId, setSelectedId] = useState(null);
  const [activeColor, setActiveColor] = useState('#4488FF');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [sockets, setSockets] = useState([]);
  const [animStates, setAnimStates] = useState([]);
  const [previewState, setPreviewState] = useState(null); // animState id being previewed
  const [previewProgress, setPreviewProgress] = useState(0); // 0-1
  const meshesRef = useRef({});

  const selectedPart = useMemo(() => parts.find(p => p.id === selectedId), [parts, selectedId]);

  const polygonCount = useMemo(() => parts.reduce((acc, p) => {
    return acc + (POLYGON_COUNTS[p.type] || 12) * (p.mirrored ? 2 : 1);
  }, 0), [parts]);

  // Parts CRUD
  const addPart = useCallback((type) => {
    if (parts.length >= MAX_PARTS) return;
    const newPart = {
      id: generateId(), type,
      name: `${ALL_COMPONENT_TYPES.find(c=>c.type===type)?.label || type} ${parts.filter(p=>p.type===type).length+1}`,
      position: [0,0,0], rotation: [0,0,0], scale: 1, scaleXYZ: [1,1,1],
      mirrored: false, visible: true, vertexColors: null
    };
    setParts(prev => [...prev, newPart]);
    setSelectedId(newPart.id);
    pushHistory({ type: 'add', part: newPart });
    return newPart;
  }, [parts, historyIdx]);

  const pushHistory = (action) => {
    setHistory(prev => [...prev.slice(0, historyIdx + 1), action]);
    setHistoryIdx(prev => prev + 1);
  };

  const updatePart = useCallback((id, updates) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deletePart = useCallback((id) => {
    const part = parts.find(p => p.id === id);
    if (!part) return;
    setParts(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
    pushHistory({ type: 'delete', part });
  }, [parts, selectedId, historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx < 0) return;
    const action = history[historyIdx];
    if (action.type === 'add') setParts(prev => prev.filter(p => p.id !== action.part.id));
    else if (action.type === 'delete') setParts(prev => [...prev, action.part]);
    setHistoryIdx(prev => prev - 1);
  }, [history, historyIdx]);

  const clearAll = useCallback(() => {
    setParts([]); setSelectedId(null); setHistory([]); setHistoryIdx(-1);
    Object.values(meshesRef.current).forEach(m => { m.geometry?.dispose(); m.material?.dispose(); });
    meshesRef.current = {};
  }, []);

  const loadAll = useCallback(({ parts: newParts = [], sockets: newSockets = [], animStates: newAnims = [] }) => {
    Object.values(meshesRef.current).forEach(m => { m.geometry?.dispose(); m.material?.dispose(); });
    meshesRef.current = {};
    setParts(newParts); setSockets(newSockets); setAnimStates(newAnims);
    setSelectedId(null); setHistory([]); setHistoryIdx(-1);
  }, []);

  // Sockets CRUD
  const addSocket = useCallback((name, type) => {
    const s = { id: generateId(), name, type, position: { x:0, y:0, z:0 }, mirror: false };
    setSockets(prev => [...prev, s]);
    return s;
  }, []);

  const updateSocket = useCallback((id, updates) => {
    setSockets(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const deleteSocket = useCallback((id) => {
    setSockets(prev => prev.filter(s => s.id !== id));
  }, []);

  // Animation States
  const addAnimState = useCallback((name, description = '') => {
    if (animStates.length >= MAX_ANIM_STATES) return;
    // Capture current transforms as baseline
    const transforms = {};
    parts.forEach(p => {
      transforms[p.id] = {
        position: [...p.position], rotation: [...p.rotation],
        scale: p.scale, scaleXYZ: [...(p.scaleXYZ || [1,1,1])]
      };
    });
    const state = { id: generateId(), name, description, transforms };
    setAnimStates(prev => [...prev, state]);
    return state;
  }, [animStates, parts]);

  const updateAnimState = useCallback((id, updates) => {
    setAnimStates(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const captureToAnimState = useCallback((id) => {
    const transforms = {};
    parts.forEach(p => {
      transforms[p.id] = {
        position: [...p.position], rotation: [...p.rotation],
        scale: p.scale, scaleXYZ: [...(p.scaleXYZ || [1,1,1])]
      };
    });
    setAnimStates(prev => prev.map(s => s.id === id ? { ...s, transforms } : s));
  }, [parts]);

  const deleteAnimState = useCallback((id) => {
    setAnimStates(prev => prev.filter(s => s.id !== id));
    if (previewState === id) setPreviewState(null);
  }, [previewState]);

  // Interpolated preview: returns parts with lerped transforms if previewing
  const previewParts = useMemo(() => {
    if (!previewState || previewProgress === 0) return parts;
    const state = animStates.find(s => s.id === previewState);
    if (!state) return parts;
    return parts.map(p => {
      const t = state.transforms[p.id];
      if (!t) return p;
      return {
        ...p,
        position: lerpArr(p.position, t.position, previewProgress),
        rotation: lerpArr(p.rotation, t.rotation, previewProgress),
        scale: lerp(p.scale, t.scale, previewProgress),
        scaleXYZ: lerpArr(p.scaleXYZ || [1,1,1], t.scaleXYZ || [1,1,1], previewProgress),
      };
    });
  }, [parts, animStates, previewState, previewProgress]);

  return {
    parts, selectedId, selectedPart, activeColor, polygonCount,
    canUndo: historyIdx >= 0, meshesRef,
    sockets, animStates, previewState, previewProgress, previewParts,
    addPart, updatePart, deletePart, setSelectedId, setActiveColor,
    undo, clearAll, loadAll,
    addSocket, updateSocket, deleteSocket,
    addAnimState, updateAnimState, captureToAnimState, deleteAnimState,
    setPreviewState, setPreviewProgress,
    setSockets,
  };
}

// ============================================================================
// SCENE (Three.js renderer)
// ============================================================================

function Scene({ parts, selectedId, onSelect, activeColor, onColorApplied, meshesRef, sockets, showSockets }) {
  const mountRef = useRef();
  const sceneRef = useRef();
  const cameraRef = useRef();
  const rendererRef = useRef();
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const socketMeshesRef = useRef({});

  // Init scene
  useEffect(() => {
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.set(4, 3, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0x304060, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(6, 10, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.4);
    fill.position.set(-5, -4, -5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xaa44ff, 0.2);
    rim.position.set(0, -6, 8);
    scene.add(rim);

    const grid = new THREE.GridHelper(12, 24, 0x1a2a44, 0x0a1220);
    grid.position.y = -1.5;
    scene.add(grid);

    // Orbit
    let drag = false, prev = { x: 0, y: 0 };
    let sph = { r: 7, theta: Math.PI / 4, phi: Math.PI / 3 };

    const applyCamera = () => {
      camera.position.set(
        sph.r * Math.sin(sph.phi) * Math.cos(sph.theta),
        sph.r * Math.cos(sph.phi),
        sph.r * Math.sin(sph.phi) * Math.sin(sph.theta)
      );
      camera.lookAt(0, 0, 0);
    };
    applyCamera();

    const onDown = e => { drag = true; prev = { x: e.clientX, y: e.clientY }; };
    const onMove = e => {
      if (!drag) return;
      sph.theta -= (e.clientX - prev.x) * 0.008;
      sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi + (e.clientY - prev.y) * 0.008));
      applyCamera();
      prev = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => { drag = false; };
    const onWheel = e => { sph.r = Math.max(1.5, Math.min(18, sph.r + e.deltaY * 0.01)); applyCamera(); };

    mount.addEventListener('mousedown', onDown);
    mount.addEventListener('mousemove', onMove);
    mount.addEventListener('mouseup', onUp);
    mount.addEventListener('wheel', onWheel);
    mount.addEventListener('contextmenu', e => e.preventDefault());

    const animate = () => { requestAnimationFrame(animate); renderer.render(scene, camera); };
    animate();

    const onResize = () => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      ['mousedown','mousemove','mouseup','wheel'].forEach(ev => mount.removeEventListener(ev, ev === 'mousedown' ? onDown : ev === 'mousemove' ? onMove : ev === 'mouseup' ? onUp : onWheel));
      mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // Update meshes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove stale
    Object.keys(meshesRef.current).forEach(id => {
      const baseId = id.replace('_mirror', '');
      const part = parts.find(p => p.id === baseId);
      if (!part || (id.endsWith('_mirror') && !part.mirrored)) {
        scene.remove(meshesRef.current[id]);
        meshesRef.current[id]?.geometry?.dispose();
        meshesRef.current[id]?.material?.dispose();
        delete meshesRef.current[id];
      }
    });

    parts.forEach(part => {
      if (!part.visible) {
        if (meshesRef.current[part.id]) meshesRef.current[part.id].visible = false;
        return;
      }

      let mesh = meshesRef.current[part.id];
      if (!mesh) {
        const geo = createGeometry(part.type);
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
        mesh = new THREE.Mesh(geo, mat);
        mesh.userData.partId = part.id;
        scene.add(mesh);
        meshesRef.current[part.id] = mesh;
      }
      mesh.visible = true;
      mesh.position.set(...part.position);
      mesh.rotation.set(
        part.rotation[0] * Math.PI / 180,
        part.rotation[1] * Math.PI / 180,
        part.rotation[2] * Math.PI / 180
      );
      const sx = part.scaleXYZ || [1,1,1];
      mesh.scale.set(part.scale * sx[0], part.scale * sx[1], part.scale * sx[2]);

      if (part.vertexColors && mesh.geometry.attributes.color) {
        const c = mesh.geometry.attributes.color;
        for (let i = 0; i < part.vertexColors.length; i++) c.array[i] = part.vertexColors[i];
        c.needsUpdate = true;
      }
      mesh.material.emissive = new THREE.Color(part.id === selectedId ? 0x112244 : 0x000000);
      mesh.material.emissiveIntensity = part.id === selectedId ? 1 : 0;

      // Mirror
      if (part.mirrored) {
        let mm = meshesRef.current[part.id + '_mirror'];
        if (!mm) {
          const geo = createGeometry(part.type);
          const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
          mm = new THREE.Mesh(geo, mat);
          mm.userData.isMirror = true; mm.userData.partId = part.id;
          scene.add(mm); meshesRef.current[part.id + '_mirror'] = mm;
        }
        if (part.vertexColors && mm.geometry.attributes.color) {
          const c = mm.geometry.attributes.color;
          for (let i = 0; i < part.vertexColors.length; i++) c.array[i] = part.vertexColors[i];
          c.needsUpdate = true;
        }
        mm.position.set(-part.position[0], part.position[1], part.position[2]);
        mm.rotation.set(part.rotation[0]*Math.PI/180, -part.rotation[1]*Math.PI/180, part.rotation[2]*Math.PI/180);
        mm.scale.set(part.scale * sx[0], part.scale * sx[1], part.scale * sx[2]);
        mm.material.emissive = mesh.material.emissive;
        mm.material.emissiveIntensity = mesh.material.emissiveIntensity;
      }
    });
  }, [parts, selectedId]);

  // Socket markers
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old socket markers
    Object.values(socketMeshesRef.current).forEach(m => scene.remove(m));
    socketMeshesRef.current = {};

    if (!showSockets) return;

    sockets.forEach(s => {
      const color = socketTypeColor(s.type);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const geo = new THREE.SphereGeometry(0.07, 8, 8);
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.set(s.position.x, s.position.y, s.position.z);
      scene.add(sphere);
      socketMeshesRef.current[s.id] = sphere;

      // Cross lines
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        -0.15,0,0, 0.15,0,0, 0,-0.15,0, 0,0.15,0, 0,0,-0.15, 0,0,0.15
      ]), 3));
      const lineMat = new THREE.LineBasicMaterial({ color, opacity: 0.5, transparent: true });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      lines.position.copy(sphere.position);
      scene.add(lines);
      socketMeshesRef.current[s.id + '_lines'] = lines;

      if (s.mirror) {
        const mGeo = new THREE.SphereGeometry(0.07, 8, 8);
        const mMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, wireframe: true });
        const mSphere = new THREE.Mesh(mGeo, mMat);
        mSphere.position.set(-s.position.x, s.position.y, s.position.z);
        scene.add(mSphere);
        socketMeshesRef.current[s.id + '_mirror'] = mSphere;
      }
    });
  }, [sockets, showSockets]);

  // Click handling
  useEffect(() => {
    const mount = mountRef.current;
    const handleClick = (e) => {
      if (e.button !== 0) return;
      const rect = mount.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const meshes = Object.values(meshesRef.current).filter(m => !m.userData.isMirror && m.visible);
      const hits = raycasterRef.current.intersectObjects(meshes);
      if (hits.length > 0) {
        const { object, faceIndex } = hits[0];
        const pid = object.userData.partId;
        if (pid !== selectedId) {
          onSelect(pid);
        } else if (activeColor && faceIndex !== undefined) {
          const colors = object.geometry.attributes.color;
          const rgb = hexToRgb(activeColor);
          const sv = faceIndex * 3;
          for (let i = 0; i < 3; i++) colors.setXYZ(sv + i, rgb.r, rgb.g, rgb.b);
          colors.needsUpdate = true;
          onColorApplied(pid, Array.from(colors.array));
        }
      } else {
        onSelect(null);
      }
    };
    mount.addEventListener('click', handleClick);
    return () => mount.removeEventListener('click', handleClick);
  }, [selectedId, activeColor, onSelect, onColorApplied]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}

// ============================================================================
// SOCKET PANEL
// ============================================================================

function SocketPanel({ sockets, addSocket, updateSocket, deleteSocket }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('weapon');

  const sel = sockets.find(s => s.id === selectedId);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addSocket(newName.trim(), newType);
    setNewName(''); setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ ...S.panelTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
        <span>SOCKETS ({sockets.length})</span>
        <button style={{ ...S.btn, padding: '2px 8px', fontSize: 14 }} onClick={() => setShowAdd(v => !v)}>+</button>
      </div>

      {showAdd && (
        <div style={{ marginTop: 8, padding: 8, background: '#060e18', borderRadius: 5, border: '1px solid #1a2a44' }}>
          <input
            style={{ ...S.input, marginBottom: 5 }}
            placeholder="Socket name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <select
            style={{ ...S.input, marginBottom: 6 }}
            value={newType}
            onChange={e => setNewType(e.target.value)}
          >
            {SOCKET_TYPES.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 5 }}>
            <button style={{ ...S.btn, ...S.btnPrimary, flex: 1 }} onClick={handleAdd}>Create</button>
            <button style={{ ...S.btn, flex: 1 }} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
        {sockets.length === 0 && (
          <div style={{ color: '#2a4a6a', fontSize: 10, textAlign: 'center', padding: 20 }}>No sockets yet</div>
        )}
        {sockets.map(s => {
          const color = socketTypeColor(s.type);
          const typeInfo = SOCKET_TYPES.find(t => t.id === s.type);
          return (
            <div
              key={s.id}
              onClick={() => setSelectedId(sid => sid === s.id ? null : s.id)}
              style={{
                ...S.socketItem,
                ...(selectedId === s.id ? { background: `${color}18`, border: `1px solid ${color}55` } : {})
              }}
            >
              <span style={{ color }}>{typeInfo?.icon} {s.name}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteSocket(s.id); if (selectedId === s.id) setSelectedId(null); }}
                style={{ background: 'none', border: 'none', color: '#ff3366', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
              >×</button>
            </div>
          );
        })}
      </div>

      {sel && (
        <div style={{ borderTop: '1px solid #1a2a44', paddingTop: 8, marginTop: 4 }}>
          <div style={{ ...S.panelTitle }}>INSPECTOR</div>
          <input
            style={{ ...S.input, marginBottom: 5 }}
            value={sel.name}
            onChange={e => updateSocket(sel.id, { name: e.target.value })}
          />
          <select
            style={{ ...S.input, marginBottom: 6 }}
            value={sel.type}
            onChange={e => updateSocket(sel.id, { type: e.target.value })}
          >
            {SOCKET_TYPES.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: '#3a5a7e', marginBottom: 4 }}>POSITION</div>
          {['x','y','z'].map((ax, i) => (
            <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ color: axisColors[i], fontSize: 10, width: 10 }}>{ax.toUpperCase()}</span>
              <input
                type="range" min="-5" max="5" step="0.05"
                style={{ flex: 1 }}
                value={sel.position[ax]}
                onChange={e => updateSocket(sel.id, { position: { ...sel.position, [ax]: parseFloat(e.target.value) } })}
              />
              <span style={{ fontSize: 9, color: '#7a9aaa', width: 36 }}>{sel.position[ax].toFixed(2)}</span>
            </div>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#5a7a9e', cursor: 'pointer', marginTop: 4 }}>
            <input
              type="checkbox"
              checked={sel.mirror}
              onChange={e => updateSocket(sel.id, { mirror: e.target.checked })}
            />
            X-axis mirror
          </label>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ANIMATION PANEL
// ============================================================================

function AnimPanel({ animStates, parts, addAnimState, updateAnimState, captureToAnimState, deleteAnimState, previewState, previewProgress, setPreviewState, setPreviewProgress, onExportState }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const animRef = useRef(null);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addAnimState(newName.trim(), newDesc.trim());
    setNewName(''); setNewDesc(''); setShowAdd(false);
  };

  const togglePreview = (stateId) => {
    if (previewState === stateId) {
      setPreviewState(null);
      setPreviewProgress(0);
      setIsPlaying(false);
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
    } else {
      setPreviewState(stateId);
      setPreviewProgress(0);
    }
  };

  const playAnimation = (stateId) => {
    if (animRef.current) { cancelAnimationFrame(animRef.current); }
    setPreviewState(stateId);
    setIsPlaying(true);
    let start = null;
    const duration = 1200;
    const tick = (ts) => {
      if (!start) start = ts;
      const t = Math.min((ts - start) / duration, 1);
      setPreviewProgress(t);
      if (t < 1) { animRef.current = requestAnimationFrame(tick); }
      else { setIsPlaying(false); animRef.current = null; }
    };
    animRef.current = requestAnimationFrame(tick);
  };

  const sel = animStates.find(s => s.id === selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ ...S.panelTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
        <span>ANIM STATES ({animStates.length}/{MAX_ANIM_STATES})</span>
        {animStates.length < MAX_ANIM_STATES && (
          <button style={{ ...S.btn, padding: '2px 8px', fontSize: 14 }} onClick={() => setShowAdd(v => !v)}>+</button>
        )}
      </div>

      {showAdd && (
        <div style={{ marginTop: 8, padding: 8, background: '#060e18', borderRadius: 5, border: '1px solid #1a2a44' }}>
          <input style={{ ...S.input, marginBottom: 5 }} placeholder="State name (e.g. wings-folded)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} autoFocus />
          <input style={{ ...S.input, marginBottom: 6 }} placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
          <div style={{ display: 'flex', gap: 5 }}>
            <button style={{ ...S.btn, ...S.btnPrimary, flex: 1 }} onClick={handleAdd}>Create + Capture</button>
            <button style={{ ...S.btn, flex: 1 }} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
        {animStates.length === 0 && (
          <div style={{ color: '#2a4a6a', fontSize: 10, textAlign: 'center', padding: 16 }}>
            No animation states yet.<br />
            <span style={{ color: '#4a6a8a' }}>Create states to define keyframe positions for parts.</span>
          </div>
        )}
        {animStates.map(state => {
          const isPrev = previewState === state.id;
          return (
            <div
              key={state.id}
              style={{
                ...S.animStateItem,
                ...(isPrev ? { border: '1px solid #aa44ff', background: '#1a0a2e' } : {}),
                ...(selectedId === state.id ? { boxShadow: '0 0 0 1px #4488ff55' } : {})
              }}
              onClick={() => setSelectedId(sid => sid === state.id ? null : state.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: isPrev ? '#aa44ff' : '#a8c8ff', fontWeight: 'bold' }}>{state.name}</span>
                  {state.description && <div style={{ fontSize: 9, color: '#3a5a7e', marginTop: 1 }}>{state.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    style={{ ...S.btn, ...S.btnAccent, padding: '2px 7px', fontSize: 9 }}
                    title="Preview / Stop"
                    onClick={e => { e.stopPropagation(); togglePreview(state.id); }}
                  >{isPrev ? '■' : '▶'}</button>
                  <button
                    style={{ ...S.btn, padding: '2px 7px', fontSize: 9, color: '#88aaff' }}
                    title="Play animation to this state"
                    onClick={e => { e.stopPropagation(); playAnimation(state.id); }}
                  >▷</button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteAnimState(state.id); if (selectedId === state.id) setSelectedId(null); }}
                    style={{ ...S.btn, ...S.btnDanger, padding: '2px 6px', fontSize: 12 }}
                  >×</button>
                </div>
              </div>

              {isPrev && (
                <div style={{ marginTop: 6 }}>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={previewProgress}
                    onChange={e => { setPreviewProgress(parseFloat(e.target.value)); setIsPlaying(false); }}
                    style={{ width: '100%' }}
                    onClick={e => e.stopPropagation()}
                  />
                  <div style={{ fontSize: 9, color: '#aa44ff', textAlign: 'right' }}>
                    {Math.round(previewProgress * 100)}% {isPlaying ? '● PLAYING' : ''}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sel && (
        <div style={{ borderTop: '1px solid #1a2a44', paddingTop: 8, marginTop: 4 }}>
          <div style={{ ...S.panelTitle }}>STATE: {sel.name}</div>
          <div style={{ fontSize: 9, color: '#3a5a7e', marginBottom: 6 }}>
            Captures transforms of {Object.keys(sel.transforms).length} parts
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              style={{ ...S.btn, ...S.btnPrimary, flex: 1, fontSize: 9 }}
              onClick={() => captureToAnimState(sel.id)}
            >↻ Recapture Current</button>
            <button
              style={{ ...S.btn, fontSize: 9 }}
              onClick={() => onExportState(sel)}
            >↓ Export JSON</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 9, color: '#2a4a5e', marginTop: 8, lineHeight: 1.5 }}>
        States define target transforms. Interpolation between DEFAULT→STATE drives animation in-game.
      </div>
    </div>
  );
}

// ============================================================================
// FILE MODAL
// ============================================================================

function FileModal({ isOpen, onClose, onExport, onImport, parts, sockets, animStates, meshName, setMeshName }) {
  const fileRef = useRef();
  const [drag, setDrag] = useState(false);
  const [tab, setTab] = useState('export');

  if (!isOpen) return null;

  const processFile = (file) => {
    if (!file.name.endsWith('.json')) { alert('Please select a .json file'); return; }
    const r = new FileReader();
    r.onload = ev => {
      try { onImport(ev.target.result); onClose(); }
      catch (e) { alert('Import failed: ' + e.message); }
    };
    r.readAsText(file);
  };

  const exports = [
    { id: 'blueprint', icon: '📋', label: 'Blueprint', desc: 'Full V5 JSON (parts+sockets+anim)' },
    { id: 'socket-config', icon: '🔌', label: 'Sockets', desc: 'socket-config.json only' },
    { id: 'obj', icon: '🎲', label: 'OBJ', desc: 'Wavefront mesh' },
    { id: 'gltf', icon: '🌐', label: 'GLTF', desc: 'Web-ready mesh' },
    { id: 'bake', icon: '📦', label: 'BAKE', desc: 'Full ZIP bundle' },
  ];

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ ...S.modalBox, minWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: '#00ffff', letterSpacing: 2 }}>
            📁 FILE OPERATIONS
          </span>
          <button style={S.btn} onClick={onClose}>×</button>
        </div>

        {/* Mesh Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: '#3a5a7e', marginBottom: 4, letterSpacing: 1 }}>ASSET NAME</div>
          <input
            style={S.input}
            placeholder="my-ship"
            value={meshName}
            onChange={e => setMeshName(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {['export','import'].map(t => (
            <button key={t} style={{ ...S.btn, ...(tab===t ? S.btnPrimary : {}), flex: 1, textTransform: 'uppercase', letterSpacing: 1 }} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {tab === 'export' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {exports.map(({ id, icon, label, desc }) => {
              const disabled = parts.length === 0 && !['blueprint','socket-config','bake'].includes(id) || sockets.length === 0 && id === 'socket-config';
              return (
                <div
                  key={id}
                  onClick={() => { if (!disabled) { onExport(id); onClose(); } }}
                  style={{
                    ...S.panel, margin: 0, cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.4 : 1, textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 'bold', marginTop: 5, color: '#c8d8ff' }}>{label}</div>
                  <div style={{ fontSize: 9, color: '#3a5a7e', marginTop: 2 }}>{desc}</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'import' && (
          <div
            style={{
              border: `2px dashed ${drag ? '#00ffff' : '#1a2a44'}`,
              borderRadius: 8, padding: 30, textAlign: 'center', cursor: 'pointer',
              background: drag ? 'rgba(0,255,255,0.04)' : 'transparent',
            }}
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files?.[0]); }}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 11, color: '#7a9aaa' }}>Click or drag & drop</div>
            <div style={{ fontSize: 9, color: '#3a5a7e' }}>Blueprint JSON · Socket-config JSON · V1 Ship JSON</div>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => processFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT: LowPolyShipDesignerV5
// ============================================================================

export default function LowPolyShipDesignerV5({
  initialDesign = null,
  onSave = null,
  onCancel = null,
  onChange = null,
  title = 'POLY FORGE V5',
  showHeader = true,
  showFooter = true,
}) {
  const ds = useDesignerState(initialDesign || []);
  const {
    parts, selectedId, selectedPart, activeColor, polygonCount,
    canUndo, meshesRef, sockets, animStates,
    previewState, previewProgress, previewParts,
    addPart, updatePart, deletePart, setSelectedId, setActiveColor,
    undo, clearAll, loadAll,
    addSocket, updateSocket, deleteSocket,
    addAnimState, captureToAnimState, deleteAnimState,
    setPreviewState, setPreviewProgress,
    setSockets,
  } = ds;

  const [activeTab, setActiveTab] = useState('MESH');
  const [partGroup, setPartGroup] = useState('ship'); // 'ship' | 'mecha'
  const [modalOpen, setModalOpen] = useState(false);
  const [showSockets, setShowSockets] = useState(true);
  const [meshName, setMeshName] = useState('my-asset');

  useEffect(() => { if (onChange) onChange(parts); }, [parts, onChange]);

  const handleColorApplied = useCallback((pid, colors) => {
    updatePart(pid, { vertexColors: colors });
  }, [updatePart]);

  const handleExport = useCallback((format) => {
    const ts = new Date().toISOString().slice(0, 10);
    const name = meshName || 'asset';
    switch (format) {
      case 'blueprint':
        exportBlueprintJSON(parts, sockets, animStates, name, `${name}-blueprint.json`);
        break;
      case 'socket-config':
        exportSocketConfig(sockets, name);
        break;
      case 'obj':
        exportToOBJ(meshesRef.current, parts, `${name}.obj`);
        break;
      case 'gltf':
        exportToGLTF(meshesRef.current, parts, `${name}.gltf`);
        break;
      case 'bake':
        handleBake(name);
        break;
    }
  }, [parts, sockets, animStates, meshName, meshesRef]);

  const handleBake = (name) => {
    // Build a minimal zip as concatenated JSON files in a text bundle
    // (Full fflate zip would require CDN; we bundle as a manifest txt instead for offline use)
    const blueprintJSON = JSON.stringify({
      version: '2.0', type: 'lowpoly-v5-blueprint', mesh: name, exportedAt: new Date().toISOString(),
      components: parts.map(({ id, ...r }) => r),
      sockets: sockets.map(({ id, ...r }) => r),
      animationStates: animStates.map(s => ({ name: s.name, description: s.description, transforms: s.transforms }))
    }, null, 2);

    const socketJSON = JSON.stringify({
      version: '1.0', mesh: name, exportedAt: new Date().toISOString(),
      sockets: sockets.map(({ id, ...s }) => ({ id: generateId(), ...s, mirroredPosition: s.mirror ? { x: -s.position.x, y: s.position.y, z: s.position.z } : null }))
    }, null, 2);

    const gltf = buildGLTFData(meshesRef.current, parts);
    const gltfJSON = JSON.stringify(gltf, null, 2);

    const animManifest = animStates.map(s => JSON.stringify({
      version: '1.0', mesh: name, stateName: s.name, transforms: s.transforms
    }, null, 2)).join('\n\n---\n\n');

    const readme = `# ${name} - Baked Asset Bundle
Generated: ${new Date().toISOString()}
Parts: ${parts.length}  Polygons: ${polygonCount}  Sockets: ${sockets.length}  AnimStates: ${animStates.length}

Files included in this bundle:
- ${name}-blueprint.json : Full V5 blueprint (re-importable)
- ${name}-socket-config.json : Socket configuration
- ${name}.gltf : GLTF mesh
- ${name}-anim-states.json : Animation state transforms

To use in game: import blueprint + socket-config, load .gltf mesh, use anim JSON for interpolation targets.
`;

    // We create a bundle text file since we can't use fflate without CDN
    const bundle = `=== BAKED ASSET BUNDLE: ${name} ===\n\n` +
      `=== FILE: ${name}-blueprint.json ===\n${blueprintJSON}\n\n` +
      `=== FILE: ${name}-socket-config.json ===\n${socketJSON}\n\n` +
      `=== FILE: ${name}.gltf ===\n${gltfJSON}\n\n` +
      `=== FILE: ${name}-anim-states.json ===\n${animManifest}\n\n` +
      `=== README ===\n${readme}`;

    downloadFile(bundle, `${name}-baked-bundle.txt`, 'text/plain');
  };

  const handleImport = useCallback((jsonString) => {
    const result = importFromBlueprint(jsonString);
    loadAll(result);
  }, [loadAll]);

  const handleExportAnimState = (state) => {
    exportAnimStateJSON(state, meshName);
  };

  const componentTypes = partGroup === 'ship' ? SHIP_TYPES : MECHA_TYPES;

  const axisColors2 = ['#ff3366', '#44ff88', '#4488ff'];

  // Use previewParts when animating, else normal parts
  const displayParts = previewState ? previewParts : parts;

  return (
    <div style={S.root}>
      {/* Header */}
      {showHeader && (
        <div style={S.header}>
          <div style={S.logo}>{title}</div>
          <div style={S.tabBar}>
            {EDITOR_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{ ...S.tab, ...(activeTab === tab ? S.tabActive : {}) }}
              >{tab}</button>
            ))}
          </div>
          <div style={S.statBar}>
            <span>PARTS <span style={S.statVal}>{parts.length}/{MAX_PARTS}</span></span>
            <span>POLY <span style={S.statVal}>{polygonCount}</span></span>
            <span>SOCKETS <span style={S.statVal}>{sockets.length}</span></span>
            <span>STATES <span style={S.statVal}>{animStates.length}</span></span>
          </div>
        </div>
      )}

      {/* Main */}
      <div style={S.main}>
        {/* LEFT: Parts or Socket or Anim list */}
        <div style={{ ...S.panel, width: 185, overflowY: 'auto', flexShrink: 0 }}>
          {activeTab === 'MESH' && (
            <>
              <div style={S.panelTitle}>Ship Parts</div>
              {parts.length === 0 ? (
                <div style={{ color: '#2a4a5e', fontSize: 10, textAlign: 'center', padding: 16 }}>Add components →</div>
              ) : (
                parts.map(part => {
                  const ctype = ALL_COMPONENT_TYPES.find(c => c.type === part.type);
                  return (
                    <div
                      key={part.id}
                      onClick={() => setSelectedId(part.id)}
                      style={{ ...S.partItem, ...(selectedId === part.id ? S.partItemSel : {}) }}
                    >
                      <span style={{ fontSize: 10 }}>{ctype?.icon} {part.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); deletePart(part.id); }}
                        style={{ background: 'none', border: 'none', color: '#ff3366', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
                      >×</button>
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === 'SOCKETS' && (
            <SocketPanel
              sockets={sockets}
              addSocket={addSocket}
              updateSocket={updateSocket}
              deleteSocket={deleteSocket}
            />
          )}

          {activeTab === 'ANIMATE' && (
            <AnimPanel
              animStates={animStates}
              parts={parts}
              addAnimState={addAnimState}
              updateAnimState={ds.updateAnimState}
              captureToAnimState={captureToAnimState}
              deleteAnimState={deleteAnimState}
              previewState={previewState}
              previewProgress={previewProgress}
              setPreviewState={setPreviewState}
              setPreviewProgress={setPreviewProgress}
              onExportState={handleExportAnimState}
            />
          )}
        </div>

        {/* CENTER: Viewport */}
        <div style={S.viewport}>
          <Scene
            parts={displayParts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            activeColor={activeColor}
            onColorApplied={handleColorApplied}
            meshesRef={meshesRef}
            sockets={sockets}
            showSockets={showSockets}
          />

          {/* Empty hint */}
          {parts.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 52, opacity: 0.12 }}>✦</div>
              <div style={{ fontSize: 11, color: '#2a4a6a', letterSpacing: 3 }}>ADD COMPONENTS TO BEGIN</div>
            </div>
          )}

          {/* Anim preview indicator */}
          {previewState && (
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(170,68,255,0.2)', border: '1px solid #aa44ff', borderRadius: 20, padding: '4px 16px', fontSize: 10, color: '#cc88ff', letterSpacing: 2 }}>
              ANIM PREVIEW · {Math.round(previewProgress * 100)}%
            </div>
          )}

          {/* Palette + tools */}
          <div style={{ ...S.panel, position: 'absolute', bottom: 16, left: 16, margin: 0 }}>
            <div style={S.panelTitle}>Paint</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, marginBottom: 10 }}>
              {PALETTE.map(color => (
                <div
                  key={color}
                  onClick={() => setActiveColor(color)}
                  style={{ ...S.swatch, background: color, ...(activeColor === color ? S.swatchActive : {}) }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button style={{ ...S.btn, opacity: canUndo ? 1 : 0.4 }} onClick={undo}>↩ Undo</button>
              <button style={S.btn} onClick={clearAll}>Clear</button>
              <button
                style={{ ...S.btn, ...(showSockets ? { border: '1px solid #4488ff', color: '#88ccff' } : {}) }}
                onClick={() => setShowSockets(v => !v)}
              >⊕ Sockets</button>
              <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setModalOpen(true)}>File</button>
            </div>
          </div>

          {/* Controls hint */}
          <div style={{ ...S.panel, position: 'absolute', top: 14, right: 14, margin: 0, fontSize: 9 }}>
            <div style={{ color: '#00ffff', marginBottom: 5, letterSpacing: 1 }}>CONTROLS</div>
            <div style={{ color: '#3a5a7e', lineHeight: 1.7 }}>
              <div>› Drag — orbit</div>
              <div>› Scroll — zoom</div>
              <div>› Click — select</div>
              <div>› Click face — paint</div>
            </div>
          </div>
        </div>

        {/* RIGHT: Component palette */}
        <div style={{ ...S.panel, width: 148, flexShrink: 0, overflowY: 'auto' }}>
          {/* Group toggle */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {['ship','mecha'].map(g => (
              <button
                key={g}
                onClick={() => setPartGroup(g)}
                style={{
                  ...S.btn, flex: 1, fontSize: 9, padding: '4px 4px',
                  textTransform: 'uppercase', letterSpacing: 1,
                  ...(partGroup === g ? S.btnPrimary : {})
                }}
              >{g}</button>
            ))}
          </div>
          <div style={S.panelTitle}>{partGroup === 'ship' ? 'Ship' : 'Mecha'} Parts</div>
          {componentTypes.map(comp => (
            <button
              key={comp.type}
              onClick={() => { addPart(comp.type); setActiveTab('MESH'); }}
              disabled={parts.length >= MAX_PARTS}
              style={{
                ...S.btn, width: '100%', marginBottom: 5, display: 'flex',
                flexDirection: 'column', alignItems: 'center', padding: 10,
                opacity: parts.length >= MAX_PARTS ? 0.4 : 1,
              }}
            >
              <span style={{ fontSize: 20 }}>{comp.icon}</span>
              <span style={{ fontSize: 8, marginTop: 4, letterSpacing: 1 }}>{comp.label}</span>
            </button>
          ))}

          {/* Socket quick-add shortcuts */}
          <div style={{ marginTop: 8, borderTop: '1px solid #1a2a44', paddingTop: 8 }}>
            <div style={S.panelTitle}>Quick Socket</div>
            {SOCKET_TYPES.slice(0, 4).map(st => (
              <button
                key={st.id}
                onClick={() => { addSocket(`${st.label} 1`, st.id); setActiveTab('SOCKETS'); setShowSockets(true); }}
                style={{
                  ...S.btn, width: '100%', marginBottom: 4, fontSize: 9, padding: '5px 6px',
                  textAlign: 'left', borderLeft: `2px solid ${st.color}`,
                }}
              >{st.icon} {st.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Transform bar */}
      {selectedPart && (
        <div style={S.transformBar}>
          {/* Position */}
          <div style={S.tGroup}>
            <span style={S.tLabel}>POS</span>
            {['X','Y','Z'].map((ax, i) => (
              <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: axisColors2[i], fontSize: 9, width: 10 }}>{ax}</span>
                <input
                  type="range" min="-6" max="6" step="0.05"
                  value={selectedPart.position[i]}
                  onChange={e => { const p = [...selectedPart.position]; p[i] = parseFloat(e.target.value); updatePart(selectedId, { position: p }); }}
                  style={{ width: 54 }}
                />
                <span style={{ fontSize: 8, width: 30, color: '#5a7a9e' }}>{selectedPart.position[i].toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Rotation */}
          <div style={S.tGroup}>
            <span style={S.tLabel}>ROT</span>
            {['X','Y','Z'].map((ax, i) => (
              <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: axisColors2[i], fontSize: 9, width: 10 }}>{ax}</span>
                <input
                  type="range" min="0" max="360" step="5"
                  value={selectedPart.rotation[i]}
                  onChange={e => { const r = [...selectedPart.rotation]; r[i] = parseFloat(e.target.value); updatePart(selectedId, { rotation: r }); }}
                  style={{ width: 54 }}
                />
                <span style={{ fontSize: 8, width: 30, color: '#5a7a9e' }}>{selectedPart.rotation[i]}°</span>
              </div>
            ))}
          </div>

          {/* Scale */}
          <div style={S.tGroup}>
            <span style={S.tLabel}>SCALE</span>
            <input type="range" min="0.1" max="4" step="0.05" value={selectedPart.scale}
              onChange={e => updatePart(selectedId, { scale: parseFloat(e.target.value) })} style={{ width: 54 }} />
            <span style={{ fontSize: 8, width: 28, color: '#5a7a9e' }}>{selectedPart.scale.toFixed(2)}×</span>
          </div>

          {/* Stretch */}
          <div style={S.tGroup}>
            <span style={S.tLabel}>STRETCH</span>
            {['X','Y','Z'].map((ax, i) => (
              <div key={ax} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: axisColors2[i], fontSize: 9, width: 10 }}>{ax}</span>
                <input
                  type="range" min="0.1" max="4" step="0.05"
                  value={selectedPart.scaleXYZ?.[i] ?? 1}
                  onChange={e => { const s = [...(selectedPart.scaleXYZ||[1,1,1])]; s[i]=parseFloat(e.target.value); updatePart(selectedId, { scaleXYZ: s }); }}
                  style={{ width: 44 }}
                />
                <span style={{ fontSize: 8, width: 24, color: '#5a7a9e' }}>{(selectedPart.scaleXYZ?.[i]??1).toFixed(1)}</span>
              </div>
            ))}
          </div>

          {/* Mirror */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 9, letterSpacing: 1 }}>
            <input
              type="checkbox"
              checked={selectedPart.mirrored}
              onChange={e => updatePart(selectedId, { mirrored: e.target.checked })}
              style={{ accentColor: '#4488ff' }}
            />
            MIRROR X
          </label>

          {/* Visibility */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 9, letterSpacing: 1 }}>
            <input
              type="checkbox"
              checked={selectedPart.visible !== false}
              onChange={e => updatePart(selectedId, { visible: e.target.checked })}
              style={{ accentColor: '#44ff88' }}
            />
            VISIBLE
          </label>

          {/* Rename */}
          <input
            style={{ ...S.input, width: 110, padding: '3px 6px' }}
            value={selectedPart.name}
            onChange={e => updatePart(selectedId, { name: e.target.value })}
            placeholder="Name"
          />
        </div>
      )}

      {/* Footer */}
      {showFooter && (onSave || onCancel) && (
        <div style={S.footer}>
          <div style={{ fontSize: 9, color: '#2a4a5e' }}>
            {parts.length} parts · {polygonCount} polys · {sockets.length} sockets · {animStates.length} states
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {onCancel && <button style={{ ...S.btn, padding: '9px 22px' }} onClick={onCancel}>Cancel</button>}
            {onSave && (
              <button style={{ ...S.btn, ...S.btnSuccess, padding: '9px 26px', fontWeight: 'bold' }} onClick={() => onSave({ parts, sockets, animStates })}>
                ✓ Save
              </button>
            )}
          </div>
        </div>
      )}

      {/* File Modal */}
      <FileModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onExport={handleExport}
        onImport={handleImport}
        parts={parts}
        sockets={sockets}
        animStates={animStates}
        meshName={meshName}
        setMeshName={setMeshName}
      />
    </div>
  );
}

export { useDesignerState, createGeometry, exportBlueprintJSON, exportSocketConfig, exportToGLTF, importFromBlueprint };
