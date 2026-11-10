package com.example.demo;

public class Caller {

    public String call() {
        return Helper.work("x");
    }

    public String callInstance(Helper helper) {
        return helper.instanceWork("x");
    }
}
