import type { NextApiRequest, NextApiResponse } from "next";
import youtubedl from "youtube-dl-exec";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import ffmpeg from "ffmpeg-static";
import { randomUUID } from "crypto";

// Absolute path to ffmpeg
const ffmpegAbsolutePath = ffmpeg as string;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  // ✅ Generate unique temp file name to avoid history issues
  const tempFilePath = path.join(process.cwd(), `temp_${randomUUID()}.mp3`);

  try {
    console.log("Downloading audio...");

    await youtubedl(url, {
      extractAudio: true,
      audioFormat: "mp3",
      output: tempFilePath,
      ffmpegLocation: ffmpegAbsolutePath,
    });

    console.log("Audio download finished, sending to OpenAI...");

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OpenAI API key" });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });

    console.log("Transcription complete:", transcription.text);

    res.status(200).json({ transcription: transcription.text });
  } catch (error: any) {
    console.error("Error in transcription pipeline:", error);
    if (error.code === "insufficient_quota" || error.status === 429) {
      return res.status(429).json({ error: "OpenAI quota exceeded. Please check your plan." });
    }
    res.status(500).json({ error: error.message });
  } finally {
    // ✅ Always clean up
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}
