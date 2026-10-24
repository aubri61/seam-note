package com.seamnote.backend.common.dto;

public class FieldErrorResponse {
    private final String field;
    private final String message;

    public FieldErrorResponse(String field, String message) {
        this.field = field;
        this.message = message;
    }

    public String getField() {
        return field;
    }
    public String getMessage() {
        return message;
    }
}
