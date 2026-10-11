import { getOperations, type Config } from './config.js';

export const PCB_SOFTWARE_LABELS = { kicad: 'KiCAD', 'jlcone-desktop': 'JLCONE Desktop' };
export const PCB_MANUFACTURER_LABELS = { jlcpcb: 'JLCPCB', pcbway: 'PCBWay', microfab: 'Microfab' };
export const PCB_SIDE_LABELS = { 'no-preference': 'No preference', 'single-sided': 'Single-sided (one copper layer)', 'double-sided': 'Double-sided (two copper layers)' };
export const pcbEnabled = (c: Config): boolean => c.genre === 'pcb' || c.capabilities.includes('pcb');

function kicadMcpSetup(c: Config): string {
  if (c.pcb?.software === 'jlcone-desktop') return '';
  const reported = c.pcb?.kicadMcpInstalled === undefined ? 'not answered' : c.pcb.kicadMcpInstalled ? 'installed' : 'not installed';
  return `
## KiCAD MCP setup after scaffolding

Run this setup on the agent's first task after Agent Kit writes the project guidance, before KiCAD automation. If software is unknown, resolve it first; this section applies only to KiCAD. User-reported MCP status: ${reported}. Treat that answer as a hint, not proof of a working connection. Agent Kit itself installs no server.

- Inspect the connected tool catalog and existing MCP/plugin configuration without printing credentials. Check the configured executable and a read-only MCP call. A working connection needs no reinstall; an existing installation with a broken connection needs repair. When the user answered no or left the answer unknown, check for an existing server before downloading anything.
- If absent, follow the current [KiCAD MCP repository](https://github.com/mixelpixx/KiCAD-MCP-Server) and its [platform guide](https://github.com/mixelpixx/KiCAD-MCP-Server/blob/stable/docs/PLATFORM_GUIDE.md). Install in a persistent system-accessible tools directory outside user/home profiles, OneDrive and the PCB project: for example C:/MCP/KiCAD-MCP-Server on Windows or /opt/mcp/KiCAD-MCP-Server on Linux/macOS. Resolve the absolute destination, verify access, preserve any existing checkout and do not fall back to a user folder. If system permissions block installation, report the exact destination and required administrator action.
- Inspect prerequisites and setup scripts before execution. Follow the repository's current supported release/branch, Node build and Python dependency instructions. Verify KiCAD's Python can import pcbnew and resolve its real module paths; do not copy example usernames or versioned paths. Use absolute runtime/server paths in MCP configuration. Stop on installation/build failures and report the failing step.
- Register the verified stdio command using the current [Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). Use the desktop MCP-server settings or codex mcp add, preserving unrelated servers. Configure required environment values from the repository's platform examples. Record the resolved path, revision and runtime versions in local project documentation.
- To add it to Codex Plugins, follow the current [official plugin packaging guide](https://developers.openai.com/plugins/build/plugins). Create a local plugin wrapper in the same system tools/marketplace root, using its supported manifest and MCP configuration format, wired to the verified server command. Include the PCB skill if a skill entry is needed. Add a local marketplace entry with a ./-relative source.path inside that root; preserve existing entries. Register that root with codex plugin marketplace add when available, then show the user how to select the marketplace and install/enable KiCAD in the Plugins Directory. Avoid registering duplicate server instances when switching to the plugin. If the installed client cannot load local stdio plugins, report that limitation and retain the working MCP-server connection.
- Verify tools are exposed and a read-only project/status query succeeds after client reload. If a restart or manual plugin installation is required, give exact remaining actions; never restart the user's client without authorization or claim the plugin connected before verification. Continue independent specification/BOM work while connection setup is pending.
`;
}

// A board-only project does not inherit the fresh software-project defaults.
export function boardOnlyDefaults(c: Config): void {
  if (!c.capabilities.every(cap => cap === 'pcb')) return;
  c.packageManager = 'none';
  c.commands = { verify: [] };
  c.database = 'none';
  c.deployment = { kind: 'none' };
  c.operations = { ...getOperations(c), dockerWorkflow: 'none', dockerRebuild: false, electron: false, electronRebuild: false, portainerStackUpdate: false };
  delete c.operations.dockerComposeFile;
  delete c.publishing;
}

export function pcbSkill(c: Config): string {
  const software = c.pcb ? PCB_SOFTWARE_LABELS[c.pcb.software] : 'not selected; ask whether the project uses KiCAD or JLCONE Desktop';
  const manufacturer = c.pcb?.manufacturer ? PCB_MANUFACTURER_LABELS[c.pcb.manufacturer] : 'not selected; for KiCAD ask whether the board will be made by JLCPCB, PCBWay or Microfab';
  return `# PCB development

Use this workflow for hobby circuit boards from requirements through a tested revision. Resume an existing board at its current stage after checking earlier deliverables; do not restart completed work. Keep firmware and board revisions aligned when firmware is in scope.

- Software: ${software}.
- Manufacturing destination: ${manufacturer}.
- Copper-layer preference: ${c.pcb?.sides ? PCB_SIDE_LABELS[c.pcb.sides] : 'not selected; ask whether single-sided, double-sided or no preference'}. This describes copper layers, not which side holds components. Respect a single-sided preference during placement and routing; confirm manufacturability and discuss jumpers or a layer change if routing cannot meet requirements. Do not silently add a copper layer.
- Use the selected CAD software and inspect its installed version and available tools before editing. KiCAD deliverables include the native project, schematic and board files; for JLCONE Desktop use its supported native formats and exports. Do not silently switch software.
- A manufacturer choice records the fabrication/assembly destination, not a guarantee that it sells every component. Before component selection, access its current official component catalog or approved sourcing service when available, and verify fabrication limits and BOM/placement formats. Confirm the intended Microfab company and official website with the user before accessing its catalog; do not guess its identity or URL.
- Search actual part numbers and datasheets. Record reference designators, quantity, value, manufacturer part number, footprint/package, vendor catalog ID, source URL, stock/price check date and assembly/DNP status in the BOM. Keep unverified availability, pricing and substitutions explicit. If catalog access is unavailable, retain a provisional BOM and report which fields need verification; never fabricate vendor IDs or claim a successful lookup.
- Refresh vendor availability before finalizing the manufacturing package. User-selected software/manufacturer does not authorize purchases or board orders.
${kicadMcpSetup(c)}

## 1. Idea & requirements

Define function, input/output power and current, physical dimensions, interfaces, environment and constraints before placing components.

Deliverable: Project specification.

## 2. System architecture & block diagram

Divide the circuit into functional sections; map power rails, signal flow and interfaces.

Deliverable: Electrical block diagram.

## 3. Component research & preliminary BOM

Select real ICs, regulators, MOSFETs, connectors, fuses, sensors and controllers. Check manufacturer datasheets, vendor availability, package dimensions, voltage/current ratings and assembly support against the requirements. Build the vendor-linked preliminary BOM using the sourcing rules above.

Deliverable: Preliminary bill of materials.

## 4. Mechanical concept & realistic PCB renders

Plan board shape, mounting holes, approximate placement and connector orientation. Produce labeled concept renders for the user's physical arrangement review before committing to electrical layout. Label concept visuals as approximate; use actual package dimensions where available.

Deliverable: Approved mechanical concept.

## 5. Schematic design

Draw every connection and required resistor, capacitor and protection device in the selected software. Include decoupling, power sequencing and design calculations using actual datasheet requirements.

Deliverable: Native schematic and design calculations (KiCAD schematic when selected).

## 6. Schematic verification

Run electrical rules checks (ERC) where supported; review datasheets, pin assignments, ratings and critical power paths. Resolve violations or document justified exceptions. Prototype uncertain sections on development boards where practical.

Deliverable: Reviewed electrical design with ERC results and documented exceptions.

## 7. PCB layout & routing

Apply the chosen manufacturer's current stackup and fabrication rules. Create the board outline, assign and verify footprints, place components, route copper, establish ground/return paths and provide thermal management.

Deliverable: Routed PCB design.

## 8. PCB validation & final 3D review

Run design rules checks (DRC), inspect footprint pin numbering, polarity, copper clearances and connector access, and verify mounting alignment. Produce mechanically accurate 3D views from the actual board and validated models; identify missing models. Resolve violations or document reviewed exceptions before declaring fabrication readiness.

Deliverable: Fabrication-approved design package with DRC results and final 3D review.

## 9. Manufacturing

Export and inspect Gerbers, drill files, the final BOM and component placement files as required for bare-board or assembly service. Check units, rotation, origin, board revision, layer mapping and vendor part IDs against the selected manufacturer's current requirements. Prepare the order package; place an order only when the user authorizes it. Track actual manufacturing and delivery status.

Deliverable: Physical bare or assembled PCBs after authorized manufacturing; until delivery, report the prepared package/order status accurately.

## 10. Bring-up, testing & revision

Inspect assembly and check for shorts before current-limited power testing. Validate rails, firmware and interfaces, then test under real loads. Record measurements and failures, correct issues in a new revision and repeat affected verification.

Deliverable: Validated PCB revision and test report. Do not claim physical tests passed without measured evidence.
`;
}
