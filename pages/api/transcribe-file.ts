import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

export const config = { api: { bodyParser: false } };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

  const form = formidable({ uploadDir, keepExtensions: true, maxFiles: 1 });

  const parsedForm = () =>
    new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) =>
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })))
    );

  try {
    const { files } = await parsedForm();
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile) return res.status(400).json({ error: "No file uploaded" });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(uploadedFile.filepath),
      model: "whisper-1",
    });

    fs.unlinkSync(uploadedFile.filepath);
    res.status(200).json({ transcription: transcription.text });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
