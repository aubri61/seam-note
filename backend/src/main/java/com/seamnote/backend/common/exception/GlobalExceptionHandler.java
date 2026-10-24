package com.seamnote.backend.common.exception;


import com.seamnote.backend.common.dto.ErrorResponse;
import com.seamnote.backend.common.dto.FieldErrorResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.Array;
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

        ErrorResponse response = new ErrorResponse(
                "INVALID_REQUEST",
                "입력값을 확인해주세요.",
                errors
        );

        return createResponse(ErrorCode.INVALID_REQUEST, errors);
//        return ResponseEntity.badRequest().body(response);
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

    ;

}
