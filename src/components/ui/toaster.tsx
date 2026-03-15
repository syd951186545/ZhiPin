// Re-export toast system for convenience
// Usage: wrap your app with <ToastProvider>, then use useToast() in components
//
// import { ToastProvider, useToast } from '@/components/ui/toast';
//
// function MyComponent() {
//   const { toast } = useToast();
//   toast('Operation successful', 'success');
//   toast('Something went wrong', 'error');
//   toast('Here is some info', 'info');
// }

export { ToastProvider, useToast } from './toast';
