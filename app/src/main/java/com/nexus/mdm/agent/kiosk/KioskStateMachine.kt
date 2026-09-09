package com.nexus.mdm.agent.kiosk

import com.nexus.mdm.agent.util.AppLogger

/**
 * Formal Enterprise Kiosk State Machine.
 */
enum class KioskState {
    NORMAL,
    ENROLLING,
    MANAGED,
    KIOSK,
    ADMIN_AUTHENTICATION,
    EXIT_KIOSK
}

object KioskStateMachine {
    private var currentState: KioskState = KioskState.NORMAL
    private val stateListeners = mutableListOf<(oldState: KioskState, newState: KioskState) -> Unit>()

    @Synchronized
    fun getState(): KioskState = currentState

    @Synchronized
    fun transitionTo(newState: KioskState): Boolean {
        val oldState = currentState
        if (oldState == newState) return true

        val isValid = when (oldState) {
            KioskState.NORMAL -> newState in listOf(KioskState.ENROLLING, KioskState.MANAGED, KioskState.KIOSK)
            KioskState.ENROLLING -> newState in listOf(KioskState.MANAGED, KioskState.NORMAL)
            KioskState.MANAGED -> newState in listOf(KioskState.KIOSK, KioskState.NORMAL)
            KioskState.KIOSK -> newState in listOf(KioskState.ADMIN_AUTHENTICATION, KioskState.EXIT_KIOSK, KioskState.MANAGED)
            KioskState.ADMIN_AUTHENTICATION -> newState in listOf(KioskState.EXIT_KIOSK, KioskState.KIOSK)
            KioskState.EXIT_KIOSK -> newState in listOf(KioskState.MANAGED, KioskState.NORMAL)
        }

        if (isValid) {
            AppLogger.i("KioskStateMachine: State transition [$oldState -> $newState]")
            currentState = newState
            stateListeners.forEach { it.invoke(oldState, newState) }
            return true
        } else {
            AppLogger.e("KioskStateMachine: Invalid state transition requested from $oldState to $newState")
            return false
        }
    }

    @Synchronized
    fun addListener(listener: (oldState: KioskState, newState: KioskState) -> Unit) {
        stateListeners.add(listener)
    }

    @Synchronized
    fun removeListener(listener: (oldState: KioskState, newState: KioskState) -> Unit) {
        stateListeners.remove(listener)
    }
}
