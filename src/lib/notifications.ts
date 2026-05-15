import { type ExternalToast, toast } from "sonner";

export function showSuccessMessage(message: string, description?: string, options?: ExternalToast) {
  toast.success(message, {
    description,
    ...options,
  });
}

export function showInfoMessage(message: string, description?: string, options?: ExternalToast) {
  toast.info(message, {
    description,
    ...options,
  });
}

export function showErrorMessage(message: string, description?: string, options?: ExternalToast) {
  toast.error(message, {
    description,
    ...options,
  });
}
