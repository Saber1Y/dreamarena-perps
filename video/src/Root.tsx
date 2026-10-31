import { Composition } from "remotion";
import { Announcement, DURATION, FPS } from "./Announcement";

export function Root() {
  return (
    <>
      <Composition id="Announcement" component={Announcement} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} defaultProps={{ withVoiceover: true }} />
      <Composition id="AnnouncementSquare" component={Announcement} durationInFrames={DURATION} fps={FPS} width={1080} height={1080} defaultProps={{ withVoiceover: true }} />
      <Composition id="AnnouncementVertical" component={Announcement} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} defaultProps={{ withVoiceover: true }} />
    </>
  );
}
