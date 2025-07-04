import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import * as textract from 'textract';

export const config = {
  api: {
    bodyParser: false, // 禁用默认的body解析器
  },
};

interface UploadResult {
  success: boolean;
  content?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
}

// 简单的PDF文本提取（基础版本）
function extractTextFromPDF(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 这里是一个简化的PDF文本提取
    // 在实际应用中，你可能需要使用专门的PDF解析库如pdf-parse
    try {
      const buffer = fs.readFileSync(filePath);
      const text = buffer.toString('utf8', 0, Math.min(buffer.length, 10000));
      // 简单清理非文本字符
      const cleanText = text.replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, ' ').trim();
      resolve(cleanText || '无法从PDF中提取文本内容');
    } catch (error) {
      reject(error);
    }
  });
}

// 正确的DOCX文本提取（使用mammoth）
function extractTextFromDOCX(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[Upload] 解析DOCX文件: ${filePath}`);
    
    mammoth.extractRawText({ path: filePath })
      .then(result => {
        const text = result.value.trim();
        if (text) {
          console.log(`[Upload] DOCX解析成功: ${text.length} 字符`);
          resolve(text);
        } else {
          console.warn('[Upload] DOCX文件为空或无法提取文本');
          resolve('DOCX文件为空或无法提取文本内容');
        }
      })
      .catch(error => {
        console.error('[Upload] DOCX解析失败:', error);
        reject(new Error(`DOCX解析失败: ${error.message}`));
      });
  });
}

// 正确的DOC文本提取（使用textract）
function extractTextFromDOC(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log(`[Upload] 解析DOC文件: ${filePath}`);
    
    textract.fromFileWithPath(filePath, (error: any, text: string) => {
      if (error) {
        console.error('[Upload] DOC解析失败:', error);
        reject(new Error(`DOC解析失败: ${error.message || error}`));
      } else {
        const cleanText = text.trim();
        if (cleanText) {
          console.log(`[Upload] DOC解析成功: ${cleanText.length} 字符`);
          resolve(cleanText);
        } else {
          console.warn('[Upload] DOC文件为空或无法提取文本');
          resolve('DOC文件为空或无法提取文本内容');
        }
      }
    });
  });
}

// 处理文本文件
function extractTextFromTXT(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      resolve(content);
    } catch (error) {
      reject(error);
    }
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResult>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '只支持POST方法' });
  }

  try {
    const form = formidable({
      uploadDir: '/tmp',
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB限制
    });

    const [fields, files] = await form.parse(req);
    
    if (!files.file || !files.file[0]) {
      return res.status(400).json({ success: false, error: '没有找到上传的文件' });
    }

    const file = files.file[0];
    const filePath = file.filepath;
    const fileName = file.originalFilename || 'unknown';
    const fileSize = file.size;

    console.log(`[Upload] 处理文件: ${fileName} (${fileSize} bytes)`);

    let extractedText = '';
    const ext = path.extname(fileName).toLowerCase();

    try {
      switch (ext) {
        case '.pdf':
          extractedText = await extractTextFromPDF(filePath);
          break;
        case '.doc':
          extractedText = await extractTextFromDOC(filePath);
          break;
        case '.docx':
          extractedText = await extractTextFromDOCX(filePath);
          break;
        case '.txt':
          extractedText = await extractTextFromTXT(filePath);
          break;
        default:
          // 尝试以文本形式读取
          try {
            extractedText = await extractTextFromTXT(filePath);
          } catch (txtError) {
            console.warn(`[Upload] 未知格式${ext}，无法解析: ${txtError}`);
            extractedText = `不支持的文件格式：${ext}。支持的格式：.txt, .doc, .docx, .pdf`;
          }
          break;
      }
    } catch (extractError) {
      console.error(`[Upload] 文件解析失败: ${extractError}`);
      extractedText = `文件上传成功，但解析失败。错误：${extractError instanceof Error ? extractError.message : extractError}`;
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.warn(`[Upload] 清理临时文件失败: ${cleanupError}`);
      }
    }

    // 限制文本长度
    if (extractedText.length > 50000) {
      extractedText = extractedText.substring(0, 50000) + '\n\n[文本过长，已截断]';
    }

    console.log(`[Upload] 文本提取成功: ${extractedText.length} 字符`);

    res.status(200).json({
      success: true,
      content: extractedText,
      fileName,
      fileSize,
    });

  } catch (error) {
    console.error('[Upload] 文件上传失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '文件上传失败',
    });
  }
} 