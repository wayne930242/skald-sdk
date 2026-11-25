import icons from "@skald/sheet-sdk/data/game-icons/icons.json";
import { PreviewerPack } from "../../../lib/previewer-pack";

export default function PackPage() {
  return <PreviewerPack iconNames={Object.keys(icons)} />;
}
