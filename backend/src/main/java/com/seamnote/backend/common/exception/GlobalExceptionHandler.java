package com.seamnote.backend.common.exception;


import com.seamnote.backend.common.dto.ErrorResponse;
import com.seamnote.backend.common.dto.FieldErrorResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.ArrayList;
import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {


    //비즈니스 에러
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException exception) {

        return createResponse(exception.getErrorCode(), List.of());
    }


    //DTO 검증 에러
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException exception) {
        List<FieldErrorResponse> errors = new ArrayList<>();

        for (var fieldError : exception.getBindingResult().getFieldErrors()) {
            FieldErrorResponse error = new FieldErrorResponse(
                    fieldError.getField(),
                    fieldError.getDefaultMessage()
            );
            errors.add(error);
        }

        return createResponse(ErrorCode.INVALID_REQUEST, errors);
    }


    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> malformed(Exception exception) {
        return createResponse(ErrorCode.MALFORMED_JSON, List.of());
    }

    @ExceptionHandler({org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class, IllegalArgumentException.class})
    public ResponseEntity<ErrorResponse> invalid(Exception exception) {
        return createResponse(ErrorCode.INVALID_REQUEST, List.of());
    }

    @ExceptionHandler({org.springframework.dao.OptimisticLockingFailureException.class, jakarta.persistence.OptimisticLockException.class})
    public ResponseEntity<ErrorResponse> versionConflict(Exception exception) {
        return createResponse(ErrorCode.VERSION_CONFLICT, List.of());
    }

    @ExceptionHandler({org.springframework.dao.DataIntegrityViolationException.class, org.hibernate.exception.ConstraintViolationException.class})
    public ResponseEntity<ErrorResponse> dataConflict(Exception exception) {
        return createResponse(ErrorCode.DATA_CONFLICT, List.of());
    }

    // 위 처리 메서드들이 공통으로 사용하는 응답 생성 메서드
    private ResponseEntity<ErrorResponse> createResponse(
            ErrorCode errorCode,
            List<FieldErrorResponse> errors
    ) {
        ErrorResponse response = new ErrorResponse(
                errorCode.name(),
                errorCode.getMessage(),
                errors
        );

        return ResponseEntity
                .status(errorCode.getStatus())
                .body(response);
    }


}
