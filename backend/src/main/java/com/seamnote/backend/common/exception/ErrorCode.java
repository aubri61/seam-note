package com.seamnote.backend.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {

    INVALID_REQUEST(
            HttpStatus.BAD_REQUEST,
            "입력값을 확인해주세요."
    ),

    MALFORMED_JSON(
            HttpStatus.BAD_REQUEST,
            "요청 JSON 형식을 확인해주세요."
    ),

    NOTE_NOT_FOUND(
            HttpStatus.NOT_FOUND,
            "문서를 찾을 수 없습니다."
    ),

    NOTE_VERSION_CONFLICT(
            HttpStatus.CONFLICT,
            "다른 곳에서 수정된 문서입니다."
    );

    private final HttpStatus status;
    private final String message;

    ErrorCode(HttpStatus status, String message) {
        this.status = status;
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

}
