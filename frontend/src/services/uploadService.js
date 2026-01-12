import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const uploadService = {
  /**
   * Upload a file to Cloudflare R2
   * @param {File} file - The file to upload
   * @param {string} fileType - Type of file (profile, document, package, delivery)
   * @param {string} token - Auth token
   * @returns {Promise<string>} - URL of uploaded file
   */
  async uploadFile(file, fileType, token) {
    try {
      // Step 1: Get presigned URL from backend
      const response = await axios.post(
        `${API}/uploads/presigned-url`,
        {
          file_type: fileType,
          content_type: file.type
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const { presigned_url, file_key } = response.data;

      // Step 2: Upload file directly to R2 using presigned URL
      await axios.put(presigned_url, file, {
        headers: {
          'Content-Type': file.type
        }
      });

      // Step 3: Return the public URL (or file_key)
      // In production, you'd construct the public URL based on your R2 bucket config
      // For now, we'll return the file_key which the backend can convert to URL
      return file_key;
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error('Falha ao fazer upload da imagem');
    }
  },

  /**
   * Upload multiple files
   * @param {File[]} files - Array of files
   * @param {string} fileType - Type of files
   * @param {string} token - Auth token
   * @returns {Promise<string[]>} - Array of file URLs
   */
  async uploadMultipleFiles(files, fileType, token) {
    const uploadPromises = files.map(file => 
      this.uploadFile(file, fileType, token)
    );
    return Promise.all(uploadPromises);
  },

  /**
   * Create a preview URL for a file
   * @param {File} file - The file
   * @returns {string} - Data URL for preview
   */
  createPreviewURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * Validate file before upload
   * @param {File} file - The file to validate
   * @param {number} maxSizeMB - Maximum size in MB
   * @returns {boolean} - True if valid
   */
  validateFile(file, maxSizeMB = 5) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (!validTypes.includes(file.type)) {
      throw new Error('Formato inválido. Use JPG, PNG ou WebP');
    }

    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(`Arquivo muito grande. Máximo ${maxSizeMB}MB`);
    }

    return true;
  }
};