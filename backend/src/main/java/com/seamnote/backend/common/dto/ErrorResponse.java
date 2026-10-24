package com.seamnote.backend.common.dto;

import java.util.List;

public class ErrorResponse {

    private final String code;
    private final String message;
    private final List<FieldErrorResponse> errors;

    public ErrorResponse(String code, String message, List<FieldErrorResponse> fieldErrors) {
        this.code = code;
        this.message = message;
        this.errors = fieldErrors;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }

    public List<FieldErrorResponse> getErrors() {
        return errors;
    }
}
