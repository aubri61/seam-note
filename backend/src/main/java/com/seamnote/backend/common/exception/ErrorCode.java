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

    FOLDER_NOT_FOUND(HttpStatus.NOT_FOUND, "폴더를 찾을 수 없습니다."),
    FOLDER_NOT_EMPTY(HttpStatus.CONFLICT, "원고나 하위 폴더가 있는 폴더는 삭제할 수 없습니다."),
    FOLDER_CYCLE_DETECTED(HttpStatus.CONFLICT, "자기 자신이나 하위 폴더로 이동할 수 없습니다."),
    DUPLICATE_ENTITY_ID(HttpStatus.CONFLICT, "이미 사용 중인 엔티티 ID입니다."),
    VERSION_CONFLICT(HttpStatus.CONFLICT, "다른 요청이 먼저 데이터를 변경했습니다."),
    DATA_CONFLICT(HttpStatus.CONFLICT, "데이터 관계 또는 정렬 제약과 충돌합니다."),
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
