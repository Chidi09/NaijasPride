import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { ToastService } from "../services/toast.service";

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((error) => {
      console.error("HTTP Error:", error);
      toast.error("An error occurred while communicating with the server");
      return throwError(() => error);
    }),
  );
};
