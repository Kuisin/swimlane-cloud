/**
 * @swimlane-cloud/mobile-view — mobile-friendly render of a kai-swimlane
 * diagram from the parsed model. Separate from the SVG renderer and the
 * desktop editor; intended as the base for a future mobile editor.
 *
 *   import { MobileDiagram } from "@swimlane-cloud/mobile-view";
 *   import "@swimlane-cloud/mobile-view/styles.css";
 *   <MobileDiagram dsl={dslString} />
 */
export { MobileDiagram } from "./MobileDiagram.jsx";
export {
  buildMobileTree,
  dslToMobile,
  roleColor,
  toColor,
} from "./mobile-model.js";
