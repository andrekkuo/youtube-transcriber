import type { NextApiRequest, NextApiResponse } from "next";
import ytdl from "ytdl-core";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;
  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid or missing YouTube URL" });
  }

  // Unique temp filename to avoid conflicts
  const tempFilePath = path.join(process.cwd(), `temp_${Date.now()}.mp3`);

  try {
    console.log("Downloading audio...");

    // Download audio from YouTube using ytdl-core
    await new Promise<void>((resolve, reject) => {
      const stream = ytdl(url, { filter: "audioonly" });
      const fileStream = fs.createWriteStream(tempFilePath);
      stream.pipe(fileStream);
      fileStream.on("finish", () => resolve());
      stream.on("error", reject);
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

  }catch (error: any) {
    console.error("Error in transcription pipeline:", error);
    if (error.code === "insufficient_quota" || error.status === 429) {
      return res.status(429).json({ error: "OpenAI quota exceeded. Please check your plan." });
    }
    res.status(500).json({ error: error.message });
  } finally {
    // Always remove temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}
