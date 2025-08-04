// public/auth.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// COLE AQUI A SUA CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBuYdERX224x0dzWtFH0mi__oVH3DxsmP0",
  authDomain: "vibracoes-cede.firebaseapp.com",
  projectId: "vibracoes-cede",
  storageBucket: "vibracoes-cede.firebasestorage.app",
  messagingSenderId: "1081610853181",
  appId: "1:1081610853181:web:b10eb65f1506d141684354"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * Função que protege uma página. Verifica se há um usuário logado.
 * Se não houver, redireciona para a página de login.
 * Retorna uma promessa que resolve com os dados do usuário se ele estiver logado.
 */
export function protegerPagina() {
    console.log("1. Função 'protegerPagina' foi chamada."); // Linha de diagnóstico
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            console.log("2. 'onAuthStateChanged' respondeu. O usuário é:", user); // Linha de diagnóstico

            unsubscribe(); // Impede que a função seja chamada múltiplas vezes

            if (user) {
                // Usuário está logado, permite o acesso à página.
                console.log("3. Usuário encontrado. Resolvendo a promessa.");
                resolve(user);
            } else {
                // Usuário não está logado, redireciona para o login.
                console.log("4. Usuário NÃO encontrado. Redirecionando para /login.html");
                window.location.href = '/login.html';
                reject('Usuário não autenticado');
            }
        });
    });
}

/**
 * Função para fazer login.
 * @param {string} email 
 * @param {string} senha 
 * @returns Promessa com o resultado do login.
 */
export function fazerLogin(email, senha) {
    return signInWithEmailAndPassword(auth, email, senha);
}

/**
 * Função para fazer logout.
 */
export function fazerLogout() {
    return signOut(auth);
}