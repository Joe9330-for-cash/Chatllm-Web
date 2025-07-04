import React, { useState, useRef } from 'react';
import { IconFile, IconText, IconUpload } from './Icons';

interface MemoryUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FileInfo {
  name: string;
  type: string;
  size: number;
  content?: string;
  file: File; // 添加实际的File对象
}

export function MemoryUploadModal({ isOpen, onClose }: MemoryUploadModalProps) {
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [textInput, setTextInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      return validTypes.includes(file.type) || file.name.endsWith('.pdf') || file.name.endsWith('.doc') || file.name.endsWith('.docx') || file.name.endsWith('.txt');
    });

    const newFileInfos: FileInfo[] = validFiles.map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
      file: file, // 保存实际的File对象
    }));

    // 检查重复文件
    const filteredNewFiles = newFileInfos.filter(newFile => 
      !selectedFiles.some(existingFile => 
        existingFile.name === newFile.name && existingFile.size === newFile.size
      )
    );

    if (filteredNewFiles.length === 0 && newFileInfos.length > 0) {
      alert('所选文件已存在，请选择其他文件');
      return;
    }

    // 合并到现有文件列表
    const currentLength = selectedFiles.length;
    setSelectedFiles(prev => [...prev, ...filteredNewFiles]);
    
    // 对于PDF和DOC文件，我们不在这里读取内容，而是在上传时处理
    // 只有文本文件才在这里预览
    filteredNewFiles.forEach((fileInfo, index) => {
      if (fileInfo.name.endsWith('.txt') && fileInfo.size < 1024 * 1024) { // 只预览小于1MB的文本文件
        // 找到对应的原始文件
        const originalFile = validFiles.find(f => f.name === fileInfo.name && f.size === fileInfo.size);
        if (originalFile) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            const targetIndex = currentLength + index;
            setSelectedFiles(prev => prev.map((f, i) => 
              i === targetIndex ? { ...f, content: content.substring(0, 500) } : f
            ));
          };
          reader.readAsText(originalFile);
        }
      }
    });

    // 清空file input以允许重新选择相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (activeTab === 'file' && selectedFiles.length === 0) {
      alert('请选择文件');
      return;
    }
    if (activeTab === 'text' && textInput.trim() === '') {
      alert('请输入文本内容');
      return;
    }

    setIsUploading(true);
    setUploadStatus('idle');

    try {
      let content = '';
      
      if (activeTab === 'file') {
        // 处理文件上传
        if (selectedFiles.length === 0) {
          throw new Error('请选择文件');
        }

        const uploadPromises = selectedFiles.map(async (fileInfo) => {
          const formData = new FormData();
          formData.append('file', fileInfo.file);

          const uploadResponse = await fetch('/api/memory/upload', {
            method: 'POST',
            body: formData,
          });

          const uploadResult = await uploadResponse.json();
          if (!uploadResult.success) {
            throw new Error(uploadResult.error || '文件上传失败');
          }

          return `文件：${uploadResult.fileName}\n内容：${uploadResult.content}`;
        });

        const uploadResults = await Promise.all(uploadPromises);
        content = uploadResults.join('\n\n');
      } else {
        // 处理文本输入
        content = textInput;
      }

      // 提取记忆
      const response = await fetch('/api/memory/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'default_user', // 添加缺失的userId参数
          messages: [
            {
              role: 'user',
              content: content,
            }
          ],
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setUploadStatus('success');
        setExtractionResult(result);
        console.log('记忆上传成功:', result);
        console.log(`提取记忆数量: ${result.count}`);
        console.log('提取方法:', result.extraction?.method);
        console.log('置信度:', result.extraction?.confidence);
        
        // 3秒后关闭模态框，给用户更多时间看到成功信息
        setTimeout(() => {
          onClose();
          resetForm();
        }, 3000);
      } else {
        setUploadStatus('error');
        setExtractionResult(result);
        console.error('记忆上传失败:', result.error);
        console.error('详细错误:', result);
      }
    } catch (error) {
      setUploadStatus('error');
      console.error('上传过程中发生错误:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setActiveTab('file');
    setTextInput('');
    setSelectedFiles([]);
    setUploadStatus('idle');
    setExtractionResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    
    // 如果删除了所有文件，清空文件输入
    if (selectedFiles.length === 1) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box w-11/12 max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">📝 记忆上传</h3>
          <button
            className="btn btn-sm btn-circle btn-ghost"
            onClick={handleClose}
          >
            ✕
          </button>
        </div>

        {/* 选项卡 */}
        <div className="tabs tabs-boxed mb-4">
          <button
            className={`tab flex items-center gap-2 ${activeTab === 'file' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            <IconFile />
            文件上传
          </button>
          <button
            className={`tab flex items-center gap-2 ${activeTab === 'text' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('text')}
          >
            <IconText />
            文本输入
          </button>
        </div>

        {/* 文件上传区域 */}
        {activeTab === 'file' && (
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">选择文件 (支持 PDF, DOC, DOCX, TXT)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileSelect}
                className="file-input file-input-bordered w-full"
              />
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-outline btn-sm mt-2"
                >
                  + 添加更多文件
                </button>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <div className="bg-base-200 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">已选择 {selectedFiles.length} 个文件:</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-base-100 rounded">
                      <div className="flex items-center gap-2">
                        <IconFile />
                        <span className="text-sm truncate max-w-[150px]" title={file.name}>{file.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs opacity-60 whitespace-nowrap">{formatFileSize(file.size)}</span>
                        <button
                          onClick={() => removeFile(index)}
                          className="btn btn-ghost btn-xs text-error hover:bg-error hover:text-error-content"
                          title="删除文件"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs opacity-60">
                  总大小: {formatFileSize(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 文本输入区域 */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">输入个人信息、偏好或其他记忆内容</span>
              </label>
              <textarea
                className="textarea textarea-bordered h-40"
                placeholder="例如：我喜欢喝咖啡，特别是拿铁。我在一家科技公司工作，主要负责前端开发。我的兴趣爱好是阅读和编程..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* 状态显示 */}
        {uploadStatus === 'success' && (
          <div className="alert alert-success mb-4">
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="font-bold">记忆上传成功！</div>
                <div className="text-sm">
                  {extractionResult ? (
                    <>
                      提取了 <span className="font-semibold">{extractionResult.count}</span> 条记忆，
                      使用 <span className="font-semibold">{extractionResult.extraction?.method || 'AI'}</span> 方法，
                      置信度 <span className="font-semibold">{(extractionResult.extraction?.confidence * 100)?.toFixed(1) || 'N/A'}%</span>
                    </>
                  ) : (
                    '已添加到您的个人记忆库中。'
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {uploadStatus === 'error' && (
          <div className="alert alert-error mb-4">
            <div>
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>上传失败，请重试。</span>
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="modal-action">
          <button
            className="btn btn-ghost"
            onClick={handleClose}
            disabled={isUploading}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={isUploading || (activeTab === 'file' && selectedFiles.length === 0) || (activeTab === 'text' && textInput.trim() === '')}
          >
            {isUploading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                上传中...
              </>
            ) : (
              <>
                <IconUpload />
                上传记忆
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 