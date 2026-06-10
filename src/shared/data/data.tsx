import {
  Youtube,
  Download,
  Monitor,
  Video,
  Mic,
  Settings2,
  Play,
  Tv,
  CheckCircle,
} from "lucide-react";

export const steps = [
  {
    id: "step1",
    num: 1,
    title: "Connect Your YouTube Account",
    desc: "Before creating a live class, make sure your YouTube account is connected to the platform.",
    instructions: [
      "Go to the Live Classes page.",
      "Click the Connect YouTube Account button.",
      "Sign in with the Google account associated with your YouTube channel.",
      "Grant all required permissions for managing live streams.",
      "Wait for the connection to complete successfully.",
    ],
    icon: <Youtube className="h-5 w-5 text-red-600" />,
  },
  {
    id: "step2",
    num: 2,
    title: "Create a Live Class",
    desc: "Once your YouTube account is connected, schedule a live class to generate stream credentials.",
    instructions: [
      "Click the Create Live Class button.",
      "Fill in the class details (Class Title, Description, Branch, Course, Batch, Date, and Start Time).",
      "Click Create Live Class.",
      "The system will automatically generate your YouTube Broadcast, RTMP URL, and Stream Key.",
    ],
    icon: <CheckCircle className="h-5 w-5 text-green-600" />,
  },
  {
    id: "step3",
    num: 3,
    title: "Download and Install OBS Studio",
    desc: "OBS Studio is free open-source software used to broadcast your screen, webcam, and audio to YouTube.",
    instructions: [
      "Visit the official website: https://obsproject.com/",
      "Download the installer for your operating system: Windows, macOS, or Linux.",
      "Run the installer and follow the default installation settings.",
    ],
    link: "https://obsproject.com/",
    linkText: "Download OBS Studio",
    icon: <Download className="h-5 w-5 text-blue-600" />,
  },
  {
    id: "step4",
    num: 4,
    title: "Open OBS Studio",
    desc: "Launch OBS Studio after installation and familiarize yourself with the core interface elements.",
    instructions: [
      "Scenes: Used to organize different screen layouts.",
      "Sources: Used to add screen sharing, webcams, images, or document windows.",
      "Audio Mixer: Controls the volume of your microphone and computer audio.",
      "Controls: Used to start/stop your broadcast and access stream settings.",
    ],
    icon: <Settings2 className="h-5 w-5 text-purple-600" />,
  },
  {
    id: "step5",
    num: 5,
    title: "Create a Scene",
    desc: "Set up a clean scene container where you will assemble your screen share and webcam.",
    instructions: [
      "In the Scenes section, click the '+' button.",
      "Enter a descriptive scene name (e.g. 'Live Class', 'Physics Lecture', 'Math Session').",
      "Click OK to save.",
    ],
    icon: <Settings2 className="h-5 w-5 text-orange-600" />,
  },
  {
    id: "step6",
    num: 6,
    title: "Add Display Capture (Share Your Screen)",
    desc: "Display Capture allows students to view everything on your screen, including slides and code editors.",
    instructions: [
      "Under the Sources panel, click the '+' button.",
      "Select Display Capture from the list.",
      "Enter a name for the source and click OK.",
      "Choose the primary display monitor you want to share.",
      "Click OK. Your screen will now appear in the OBS preview window.",
    ],
    icon: <Monitor className="h-5 w-5 text-teal-600" />,
  },
  {
    id: "step7",
    num: 7,
    title: "Add Webcam (Optional)",
    desc: "Adding a webcam window helps students see you while teaching, keeping them engaged.",
    instructions: [
      "Click the '+' button under the Sources panel.",
      "Select Video Capture Device.",
      "Choose Create New and name it (e.g. 'Webcam').",
      "Select your camera from the Device dropdown and click OK.",
      "Resize and reposition the webcam frame in the preview layout.",
    ],
    icon: <Video className="h-5 w-5 text-rose-600" />,
  },
  {
    id: "step8",
    num: 8,
    title: "Add Microphone Audio",
    desc: "Ensure students can hear your voice clearly with no lag.",
    instructions: [
      "Look at the Audio Mixer panel. Speak into your microphone and verify the Mic/Aux audio level bar moves.",
      "If your microphone is not detected:",
      "Go to Settings → Audio.",
      "Under Mic/Auxiliary Audio, select your active microphone input device.",
      "Click Apply.",
    ],
    icon: <Mic className="h-5 w-5 text-indigo-600" />,
  },
  {
    id: "step9",
    num: 9,
    title: "Configure Stream Settings",
    desc: "Connect OBS Studio with your scheduled live class using the stream credentials.",
    instructions: [
      "In OBS Studio, click Settings in the bottom-right Controls panel.",
      "Click the Stream tab on the left sidebar.",
      "Change the Service dropdown to Custom...",
      "Copy the RTMP URL and Stream Key from the scheduled class page on the platform.",
      "Paste the RTMP URL into the Server field and the Stream Key into the Stream Key field.",
      "Click Apply and OK.",
    ],
    isWarning: true,
    warningText:
      "Never share your stream key with anyone. It allows anyone to stream directly to your channel.",
    codeBlocks: [
      { label: "Server / RTMP URL Example", value: "rtmp://a.rtmp.youtube.com/live2" },
      { label: "Stream Key Example", value: "xxxx-xxxx-xxxx-xxxx-xxxx" },
    ],
    icon: <KeyIcon className="h-5 w-5 text-amber-600" />,
  },
  {
    id: "step10",
    num: 10,
    title: "Configure Video Quality",
    desc: "Set the video resolution and frames per second (FPS) for a crisp and buffer-free stream.",
    instructions: [
      "Go to Settings → Video.",
      "Base Resolution: Set to 1920x1080 (or your native monitor resolution).",
      "Output (Scaled) Resolution: Set to 1920x1080 for HD stream quality.",
      "FPS (Frames Per Second): Select 30 FPS for optimal performance.",
      "Note: If your internet upload speed is slow, change Output Resolution to 1280x720 (720p).",
    ],
    icon: <Tv className="h-5 w-5 text-cyan-600" />,
  },
  {
    id: "step11",
    num: 11,
    title: "Configure Output Settings",
    desc: "Tune output bitrates and encoders to match stream requirements.",
    instructions: [
      "Go to Settings → Output.",
      "Set Output Mode to Advanced.",
      "Encoder: Choose Hardware (NVENC) if available, otherwise select x264.",
      "Bitrate: Set to 4500 - 6000 Kbps (ensure your internet speed can support this upload rate).",
      "Keyframe Interval: Set to 2.",
    ],
    icon: <Settings2 className="h-5 w-5 text-violet-600" />,
  },
  {
    id: "step12",
    num: 12,
    title: "Start Streaming",
    desc: "Send the video feed from OBS to the YouTube servers.",
    instructions: [
      "In OBS Studio, click the Start Streaming button under Controls.",
      "Check the status bar at the bottom: it should show green, indicating a healthy connection.",
      "Verify OBS displays the 'LIVE' indicator.",
    ],
    icon: <Play className="h-5 w-5 text-emerald-600" />,
  },
  {
    id: "step13",
    num: 13,
    title: "Start the Live Class",
    desc: "Go live on the platform for your students.",
    instructions: [
      "Return to the Live Classes page on the platform.",
      "Open your scheduled live class dashboard.",
      "Click the Start Live Class button.",
      "Wait for YouTube to detect the incoming stream feed. Students will now see your broadcast!",
    ],
    icon: <CheckCircle className="h-5 w-5 text-primary" />,
  },
];

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3" />
      <path d="m18 5 3 3" />
    </svg>
  );
}
