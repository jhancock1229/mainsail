import Vue from 'vue'
import axios, { AxiosProgressEvent, CancelTokenSource } from 'axios'

export const shellUpload = Vue.observable({
    uploading: false,
    percent: 0,
    uploadedFilename: null as string | null,
    failed: false,
})

let cancelSource: CancelTokenSource | null = null

export const startShellUpload = async (file: File, apiUrl: string): Promise<void> => {
    if (shellUpload.uploading) return

    const formData = new FormData()
    formData.append('file', file, file.name)
    cancelSource = axios.CancelToken.source()
    shellUpload.uploading = true
    shellUpload.percent = 0
    shellUpload.failed = false

    try {
        const result = await axios.post(apiUrl + '/server/files/upload', formData, {
            cancelToken: cancelSource.token,
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (event: AxiosProgressEvent) => {
                shellUpload.percent = Math.round((event.progress ?? 0) * 100)
            },
        })
        shellUpload.uploadedFilename = result.data?.result?.item?.path ?? result.data?.item?.path ?? file.name
    } catch (error) {
        shellUpload.failed = !axios.isCancel(error)
    } finally {
        shellUpload.uploading = false
        cancelSource = null
    }
}

export const cancelShellUpload = (): void => {
    cancelSource?.cancel()
}
