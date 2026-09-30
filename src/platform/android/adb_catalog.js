const COMMANDS = [
  {
    id: 'devices',
    label: 'adb devices -l',
    description: 'Enumera dispositivos y muestra detalles básicos de identificación.',
    requiresDevice: false,
    args: () => ['devices', '-l'],
  },
  {
    id: 'model',
    label: 'adb shell getprop ro.product.model',
    description: 'Consulta el modelo reportado por Android.',
    requiresDevice: true,
    args: () => ['shell', 'getprop', 'ro.product.model'],
  },
  {
    id: 'android-version',
    label: 'adb shell getprop ro.build.version.release',
    description: 'Consulta la versión principal de Android.',
    requiresDevice: true,
    args: () => ['shell', 'getprop', 'ro.build.version.release'],
  },
  {
    id: 'battery',
    label: 'adb shell dumpsys battery',
    description: 'Lee el estado de batería expuesto por el servicio del sistema.',
    requiresDevice: true,
    args: () => ['shell', 'dumpsys', 'battery'],
  },
  {
    id: 'storage',
    label: 'adb shell df -h /sdcard',
    description: 'Consulta espacio disponible en almacenamiento compartido.',
    requiresDevice: true,
    args: () => ['shell', 'df', '-h', '/sdcard'],
  },
  {
    id: 'screen-size',
    label: 'adb shell wm size',
    description: 'Consulta la resolución lógica de pantalla.',
    requiresDevice: true,
    args: () => ['shell', 'wm', 'size'],
  },
  {
    id: 'ui-hierarchy',
    label: 'adb exec-out uiautomator dump /dev/tty',
    description: 'Lee la jerarquia visible para estudiar selectores y bounds antes de automatizar.',
    requiresDevice: true,
    args: () => ['exec-out', 'uiautomator', 'dump', '/dev/tty'],
  },
  {
    id: 'shared-storage',
    label: 'adb shell ls -la /sdcard',
    description: 'Lista el nivel superior del almacenamiento compartido sin copiar archivos.',
    requiresDevice: true,
    args: () => ['shell', 'ls', '-la', '/sdcard'],
  }
];

function decodeXmlAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseXmlAttributes(nodeText) {
  const attributes = {};
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(nodeText)) !== null) {
    attributes[match[1]] = decodeXmlAttribute(match[2]);
  }
  return attributes;
}

function parseUiHierarchyNodes(xml) {
  const source = String(xml || '');
  const root = source.match(/<hierarchy\b([^>]*)>/i);
  const rootAttributes = root ? parseXmlAttributes(root[1]) : {};
  const nodes = [];
  const nodePattern = /<node\b[^>]*>/gi;
  let match;
  while ((match = nodePattern.exec(source)) !== null) {
    nodes.push(parseXmlAttributes(match[0]));
  }
  return { rootAttributes, nodes };
}

function summarizeUiHierarchy(xml) {
  const { rootAttributes, nodes } = parseUiHierarchyNodes(xml);

  const relevant = nodes.filter((node) => (
    node.text || node['content-desc'] || node['resource-id'] ||
    node.clickable === 'true' || node.scrollable === 'true' || node.focusable === 'true'
  ));
  const lines = [
    'JERARQUIA UI RESUMIDA',
    `Rotacion: ${rootAttributes.rotation || 'desconocida'}`,
    `Pantalla: ${nodes[0]?.bounds || 'desconocida'}`,
    `Paquete visible: ${nodes[0]?.package || 'desconocido'}`,
    `Nodos totales: ${nodes.length} | Nodos relevantes: ${relevant.length}`
  ];

  relevant.slice(0, 40).forEach((node, index) => {
    const parts = [`[${String(index + 1).padStart(2, '0')}]`];
    if (node.text) parts.push(`text="${node.text}"`);
    if (node['content-desc']) parts.push(`desc="${node['content-desc']}"`);
    if (node['resource-id']) parts.push(`id="${node['resource-id']}"`);
    if (node.class) parts.push(`class=${node.class}`);
    if (node.bounds) parts.push(`bounds=${node.bounds}`);
    if (node.clickable === 'true') parts.push('clickable');
    if (node.scrollable === 'true') parts.push('scrollable');
    lines.push(parts.join(' | '));
  });

  if (relevant.length > 40) {
    lines.push(`... ${relevant.length - 40} nodos relevantes omitidos de la vista.`);
  }
  return lines.join('\n');
}

function listAdbLearningCommands() {
  return COMMANDS.map(({ id, label, description, requiresDevice }) => ({
    id,
    label,
    description,
    requiresDevice
  }));
}

function getAdbLearningCommand(id) {
  return COMMANDS.find((command) => command.id === id) || null;
}

module.exports = {
  listAdbLearningCommands,
  getAdbLearningCommand,
  parseUiHierarchyNodes,
  summarizeUiHierarchy
};
